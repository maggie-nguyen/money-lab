import { withApi } from "@/server/http";
import { readJsonBody } from "@/server/services/adminCommon";
import { patchFeedback } from "@/server/services/adminOpsService";

// PATCH /admin/feedback/{id} { resolved, resolutionNote? } - doc 03 §14.5.

export const PATCH = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "write" }, async (ctx) => {
  const body = await readJsonBody(ctx);
  const data = await patchFeedback(ctx.params.id ?? "", body, { id: ctx.user!.id, ip: ctx.ip }, ctx.now());
  return { data };
});
