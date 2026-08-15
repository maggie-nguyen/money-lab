import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { signAccessToken } from "@/server/auth/jwt";
import { createThread } from "@/server/services/tutorService";
import { GET as listThreadsRoute } from "@/app/api/v1/tutor/threads/route";
import { makeLearner, runClock } from "../factories";

/**
 * The thread list is typed `TutorThreadView[]` on the client, which maps over it
 * directly. Returning the whole service result under `data` type-checks fine and
 * only blows up in the browser, so the envelope shape is pinned here.
 */

const NOW = runClock();

let token = "";
let userId = "";

beforeAll(async () => {
  process.env.RATE_LIMIT_DISABLED = "true";
  const learner = await makeLearner(() => NOW);
  userId = learner.user.id;
  token = await signAccessToken({ sub: userId, role: "LEARNER" }, NOW);
  await createThread(userId, { contextType: "GENERAL", contextId: null }, "vi", NOW);
});

function req(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("GET /api/v1/tutor/threads", () => {
  it("puts the array in data and paging in meta", async () => {
    const res = await listThreadsRoute(req("/api/v1/tutor/threads"), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: unknown;
      meta: { nextCursor: string | null; hasMore: boolean };
    };
    expect(Array.isArray(body.data)).toBe(true);
    expect((body.data as unknown[]).length).toBeGreaterThan(0);
    expect(body.meta.hasMore).toBe(false);
    expect(body.meta.nextCursor).toBeNull();
  });

  it("only lists the caller's own threads", async () => {
    const other = await makeLearner(() => NOW);
    const otherToken = await signAccessToken({ sub: other.user.id, role: "LEARNER" }, NOW);
    const res = await listThreadsRoute(
      new NextRequest("http://localhost:3000/api/v1/tutor/threads", {
        headers: { authorization: `Bearer ${otherToken}` },
      }),
      { params: Promise.resolve({}) },
    );
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(0);
  });
});
