import { withApi } from "@/server/http";
import { readJsonBody } from "@/server/services/adminCommon";
import { adjustGamification } from "@/server/services/adminOpsService";

// POST /admin/gamification/adjust { userId, xpDelta?, coinDelta?, reason } - doc 03 §14.7.
// Writes ADMIN_ADJUST ledger rows; refuses adjustments that would push coins negative.

export const POST = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "write" }, async (ctx) => {
  const body = await readJsonBody(ctx);
  const data = await adjustGamification(body, { id: ctx.user!.id, ip: ctx.ip }, ctx.now());
  return { data };
});
