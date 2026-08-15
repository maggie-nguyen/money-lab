import { z } from "zod";
import { withApi, parseBody } from "@/server/http";
import { patchProgress } from "@/server/services/progressService";

const body = z.object({
  lastBlockIndex: z.number().int().min(0).optional(),
  secondsSpentDelta: z.number().int().min(0).max(3600).optional(),
});

// PATCH /lessons/:id/progress - monotonic lastBlockIndex
export const PATCH = withApi({ auth: "required", rateLimit: "write" }, async (ctx) => ({
  data: await patchProgress(ctx.user!.id, ctx.params.id!, await parseBody(ctx, body), ctx.now),
}));
