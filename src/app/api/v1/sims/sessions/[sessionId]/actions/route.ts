import { z } from "zod";
import { withApi, parseBody } from "@/server/http";
import { postAction } from "@/server/services/simService";

const body = z.object({
  expectedStateVersion: z.number().int().min(0),
  action: z.object({ type: z.string().min(1).max(40) }).passthrough(),
});

// POST - apply one engine action. Idempotency-Key supported; optimistic
// concurrency via expectedStateVersion (409 VERSION_CONFLICT when stale).
export const POST = withApi(
  { auth: "required", rateLimit: "sim-action", idempotent: true },
  async (ctx) => {
    const input = await parseBody(ctx, body);
    return {
      data: await postAction(
        ctx.user!.id,
        ctx.params.sessionId!,
        input.expectedStateVersion,
        input.action,
        ctx.now,
        "vi",
      ),
    };
  },
);
