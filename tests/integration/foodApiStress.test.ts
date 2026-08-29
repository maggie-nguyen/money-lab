import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { withApi as rawWithApi } from "@/server/http";
import { resetEnvCache } from "@/server/config";
import { mapBoundsQuerySchema } from "@/server/lib/mapBoundsQuery";
import { MAP_SPOT_FETCH_BOUNDS } from "@/lib/map";
import { communityFoodSpotBodySchema } from "@/server/services/foodMapService";
import { makeLearner } from "../factories";

// Exercise the /api/v1/food/spots route guards (bounds validation, auth on the
// community POST, and the read rate-limit bucket) through withApi directly.

function withApi(...args: Parameters<typeof rawWithApi>) {
  const run = rawWithApi(...args);
  return (request: NextRequest) => run(request, { params: Promise.resolve({}) });
}

function req(method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}): NextRequest {
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

describe("food bounds validation", () => {
  it("rejects a continent-scale area", async () => {
    const parsed = mapBoundsQuerySchema.safeParse({ swLat: "0", swLng: "100", neLat: "30", neLng: "112" });
    expect(parsed.success).toBe(false);
  });

  it("accepts a normal city viewport", async () => {
    const parsed = mapBoundsQuerySchema.safeParse({ swLat: "10.7", swLng: "106.5", neLat: "10.9", neLng: "106.9" });
    expect(parsed.success).toBe(true);
  });

  it("accepts the Vietnam-wide coverage bbox", async () => {
    const parsed = mapBoundsQuerySchema.safeParse(MAP_SPOT_FETCH_BOUNDS);
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-range latitudes", async () => {
    const parsed = mapBoundsQuerySchema.safeParse({ swLat: "-91", swLng: "100", neLat: "30", neLng: "112" });
    expect(parsed.success).toBe(false);
  });
});

describe("community food spot POST requires auth", () => {
  it("401 without token on the real POST route config", () => {
    const handler = withApi({ auth: "required", rateLimit: "write" }, async () => ({ data: {} }));
    return handler(req("POST", "/api/v1/food/spots", { body: {} })).then((res) => {
      expect(res.status).toBe(401);
    });
  });

  it("200 with a valid token", async () => {
    const handler = withApi({ auth: "required", rateLimit: "write" }, async () => ({ data: { ok: true } }));
    const { accessToken } = await makeLearner();
    const res = await handler(req("POST", "/api/v1/food/spots", { token: accessToken, body: {} }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.ok).toBe(true);
  });
});

describe("community spot price ceiling", () => {
  it("rejects a submission over the 60k student-meal ceiling", () => {
    const result = communityFoodSpotBodySchema.safeParse({
      name: "Quán quá đắt",
      address: "123 Đường thử",
      lat: 10.78,
      lng: 106.68,
      priceVnd: "500000",
      clusterSlug: "hanoi" as const,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a submission at the 60k ceiling", () => {
    const result = communityFoodSpotBodySchema.safeParse({
      name: "Quán vừa túi",
      address: "123 Đường thử",
      lat: 10.78,
      lng: 106.68,
      priceVnd: "60000",
      clusterSlug: "hanoi" as const,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a below-minimum price", () => {
    const result = communityFoodSpotBodySchema.safeParse({
      name: "Quán miễn phí",
      address: "123 Đường thử",
      lat: 10.78,
      lng: 106.68,
      priceVnd: "500",
      clusterSlug: "hanoi" as const,
    });
    expect(result.success).toBe(false);
  });
});

describe("concurrent read stress through withApi", () => {
  it("40 parallel read-rate-limited GETs all succeed under the 600/60s bucket", async () => {
    process.env.RATE_LIMIT_DISABLED = "false";
    resetEnvCache();
    const handler = withApi({ auth: "none", rateLimit: "read" }, async () => ({ data: { at: Date.now() } }));
    const ip = `10.2.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    const results = await Promise.all(
      Array.from({ length: 40 }, () => handler(req("GET", "/api/v1/food/spots", { headers: { "x-forwarded-for": ip } }))),
    );
    for (const r of results) expect(r.status).toBe(200);
  });

  it("exceeding the read bucket returns 429", async () => {
    process.env.RATE_LIMIT_DISABLED = "false";
    resetEnvCache();
    const handler = withApi({ auth: "none", rateLimit: "read" }, async () => ({ data: {} })); // 600/60s
    const ip = `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    // push past 600 quickly (we only need to exceed; use a fast loop)
    let last = 200;
    for (let i = 0; i < 601; i++) {
      last = (await handler(req("GET", "/api/v1/food/spots", { headers: { "x-forwarded-for": ip } }))).status;
      if (last === 429) break;
    }
    expect(last).toBe(429);
  });
});
