import { z } from "zod";
import { withApi, parseBody } from "@/server/http";
import { createSession } from "@/server/services/simService";

const body = z.object({ optionsKey: z.string().max(30).default("default") });

// POST - start a session (409 CONFLICT if one is active). Idempotency-Key supported.
export const POST = withApi(
  { auth: "required", rateLimit: "write", idempotent: true },
  async (ctx) => {
    const input = await parseBody(ctx, body);
    return {
      data: await createSession(ctx.user!.id, ctx.params.idOrSlug!, input.optionsKey ?? "default", ctx.now),
      status: 201,
    };
  },
);
