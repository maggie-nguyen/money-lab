import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { withApi as rawWithApi, parseBody, type ApiCtx } from "@/server/http";
import { resetEnvCache } from "@/server/config";
import { signAccessToken } from "@/server/auth/jwt";
import { makeLearner, uniqueEmail } from "../factories";

// doc 01 §3–§5 - the request lifecycle wrapper, exercised by calling
// withApi-wrapped handlers directly with NextRequest objects.

function req(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers ?? {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
}

// Next supplies the route context; these tests call handlers directly, so the
// empty params bag is filled in here once.
function withApi(...args: Parameters<typeof rawWithApi>) {
  const run = rawWithApi(...args);
  return (request: NextRequest) => run(request, { params: Promise.resolve({}) });
}

const echo = async (ctx: ApiCtx) => ({ data: { userId: ctx.user?.id ?? null } });

afterEach(() => {
  delete process.env.RATE_LIMIT_DISABLED;
  process.env.RATE_LIMIT_DISABLED = "true";
  resetEnvCache();
});

describe("envelope & requestId", () => {
  it("success responses carry {data} and x-request-id", async () => {
    const handler = withApi({ auth: "none" }, echo);
    const res = await handler(req("GET", "/api/ping"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toMatch(/^req_/);
    expect(await res.json()).toEqual({ data: { userId: null } });
  });

  it("204 carries no body", async () => {
    const handler = withApi({ auth: "none" }, async () => ({ data: null, status: 204 }));
    const res = await handler(req("POST", "/api/x"));
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("unhandled exceptions become a 500 INTERNAL envelope", async () => {
    const handler = withApi({ auth: "none" }, async () => {
      throw new TypeError("boom");
    });
    const res = await handler(req("GET", "/api/x"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.message).toBe("Internal server error"); // no leak of internals
    expect(body.error.requestId).toMatch(/^req_/);
  });
});

describe("authN / authZ", () => {
  it("401 UNAUTHENTICATED without a token when auth is required", async () => {
    const handler = withApi({ auth: "required" }, echo);
    const res = await handler(req("GET", "/api/me"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatchObject({ code: "UNAUTHENTICATED", requestId: expect.stringMatching(/^req_/) });
  });

  it("401 with a tampered token", async () => {
    const handler = withApi({ auth: "required" }, echo);
    const { accessToken } = await makeLearner();
    const res = await handler(req("GET", "/api/me", { token: accessToken.slice(0, -2) + "xx" }));
    expect(res.status).toBe(401);
  });

  it("accepts a valid bearer token and exposes the user to the handler", async () => {
    const handler = withApi({ auth: "required" }, echo);
    const { accessToken, user } = await makeLearner();
    const res = await handler(req("GET", "/api/me", { token: accessToken }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.userId).toBe(user.id);
  });

  it("403 FORBIDDEN when a LEARNER hits an ADMIN-only route", async () => {
    const handler = withApi({ auth: "required", roles: ["ADMIN"] }, echo);
    const { accessToken } = await makeLearner();
    const res = await handler(req("GET", "/api/admin/x", { token: accessToken }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
  });

  it("ADMIN role claim passes the role gate", async () => {
    const handler = withApi({ auth: "required", roles: ["ADMIN"] }, echo);
    const { user } = await makeLearner();
    const adminToken = await signAccessToken({ sub: user.id, role: "ADMIN" }, new Date());
    const res = await handler(req("GET", "/api/admin/x", { token: adminToken }));
    expect(res.status).toBe(200);
  });
});

describe("CSRF origin check", () => {
  it("rejects cross-origin state-changing requests", async () => {
    const handler = withApi({ auth: "none" }, echo);
    const res = await handler(req("POST", "/api/x", { headers: { origin: "https://evil.example" }, body: {} }));
    expect(res.status).toBe(403);
  });

  it("allows same-origin and origin-less (non-browser) requests", async () => {
    const handler = withApi({ auth: "none" }, echo);
    expect((await handler(req("POST", "/api/x", { headers: { origin: "http://localhost:3000" }, body: {} }))).status).toBe(200);
    expect((await handler(req("POST", "/api/x", { body: {} }))).status).toBe(200);
  });
});

describe("validation", () => {
  const schema = z.object({ name: z.string().min(1) });
  const handler = withApi({ auth: "none" }, async (ctx) => {
    const body = await parseBody(ctx, schema);
    return { data: body };
  });

  it("400 VALIDATION_ERROR with body.* paths on schema failure", async () => {
    const res = await handler(req("POST", "/api/x", { body: { name: "" } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details[0].path).toBe("body.name");
  });

  it("400 on malformed JSON", async () => {
    const raw = new NextRequest("http://localhost:3000/api/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await handler(raw);
    expect(res.status).toBe(400);
  });
});

describe("rate limiting", () => {
  it("returns 429 with retry-after once the bucket overflows", async () => {
    process.env.RATE_LIMIT_DISABLED = "false";
    resetEnvCache();
    const handler = withApi({ auth: "none", rateLimit: "auth" }, echo); // 10 / 600s by IP
    const ip = `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    const call = () => handler(req("POST", "/api/auth/login", { headers: { "x-forwarded-for": ip }, body: {} }));
    for (let i = 0; i < 10; i++) {
      expect((await call()).status).toBe(200);
    }
    const res = await call();
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("RATE_LIMITED");
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("a forged x-forwarded-for prefix cannot spread attempts across addresses", async () => {
    // The proxy appends the address it accepted, so the rightmost hop is the
    // real caller. A client writing its own prefix should stay in one bucket.
    process.env.RATE_LIMIT_DISABLED = "false";
    resetEnvCache();
    const handler = withApi({ auth: "none", rateLimit: "auth" }, echo);
    const real = `10.7.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    const call = (forged: string) =>
      handler(
        req("POST", "/api/auth/login", {
          headers: { "x-forwarded-for": `${forged}, ${real}` },
          body: {},
        }),
      );
    for (let i = 0; i < 10; i++) {
      expect((await call(`203.0.113.${i}`)).status).toBe(200);
    }
    expect((await call("203.0.113.99")).status).toBe(429);
  });

  it("buckets are per-subject - a different IP is unaffected", async () => {
    process.env.RATE_LIMIT_DISABLED = "false";
    resetEnvCache();
    const handler = withApi({ auth: "none", rateLimit: "auth" }, echo);
    const hot = "10.8.1.1";
    for (let i = 0; i < 11; i++) {
      await handler(req("POST", "/api/auth/login", { headers: { "x-forwarded-for": hot }, body: {} }));
    }
    const other = await handler(req("POST", "/api/auth/login", { headers: { "x-forwarded-for": "10.8.1.2" }, body: {} }));
    expect(other.status).toBe(200);
  });
});

describe("idempotency", () => {
  let calls = 0;
  const orderHandler = withApi({ auth: "required", idempotent: true }, async () => {
    calls += 1;
    return { data: { orderNumber: calls }, status: 201 };
  });

  it("same key + same body replays the stored response without re-running the handler", async () => {
    const { accessToken } = await makeLearner();
    calls = 0;
    const key = `idem-${uniqueEmail("k")}`;
    const body = { itemKey: "hat_blue" };
    const first = await orderHandler(req("POST", "/api/shop/buy", { token: accessToken, body, headers: { "idempotency-key": key } }));
    expect(first.status).toBe(201);
    expect((await first.json()).data.orderNumber).toBe(1);

    const replay = await orderHandler(req("POST", "/api/shop/buy", { token: accessToken, body, headers: { "idempotency-key": key } }));
    expect(replay.status).toBe(201);
    expect(replay.headers.get("idempotent-replay")).toBe("true");
    expect((await replay.json()).data.orderNumber).toBe(1);
    expect(calls).toBe(1);
  });

  it("same key + different body is a 409 CONFLICT", async () => {
    const { accessToken } = await makeLearner();
    const key = `idem-${uniqueEmail("k")}`;
    await orderHandler(req("POST", "/api/shop/buy", { token: accessToken, body: { itemKey: "a" }, headers: { "idempotency-key": key } }));
    const res = await orderHandler(req("POST", "/api/shop/buy", { token: accessToken, body: { itemKey: "b" }, headers: { "idempotency-key": key } }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("CONFLICT");
  });

  it("keys are scoped per user - another user with the same key runs fresh", async () => {
    const a = await makeLearner();
    const b = await makeLearner();
    calls = 0;
    const key = "shared-key-123";
    const body = { itemKey: "hat_blue" };
    await orderHandler(req("POST", "/api/shop/buy", { token: a.accessToken, body, headers: { "idempotency-key": key } }));
    await orderHandler(req("POST", "/api/shop/buy", { token: b.accessToken, body, headers: { "idempotency-key": key } }));
    expect(calls).toBe(2);
  });

  it("handler still sees the body consumed for hashing", async () => {
    const schema = z.object({ itemKey: z.string() });
    const echoBody = withApi({ auth: "required", idempotent: true }, async (ctx) => ({
      data: await parseBody(ctx, schema),
    }));
    const { accessToken } = await makeLearner();
    const res = await echoBody(
      req("POST", "/api/x", { token: accessToken, body: { itemKey: "hat_red" }, headers: { "idempotency-key": `k-${uniqueEmail()}` } }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.itemKey).toBe("hat_red");
  });
});
