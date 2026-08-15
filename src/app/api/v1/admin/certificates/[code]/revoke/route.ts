import { withApi } from "@/server/http";
import { readJsonBody } from "@/server/services/adminCommon";
import { revokeCertificate } from "@/server/services/adminOpsService";

// POST /admin/certificates/{code}/revoke { reason } - doc 03 §14.7.
// The public verify endpoint reports REVOKED from then on.

export const POST = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "write" }, async (ctx) => {
  const body = await readJsonBody(ctx);
  const data = await revokeCertificate(ctx.params.code ?? "", body, { id: ctx.user!.id, ip: ctx.ip }, ctx.now());
  return { data };
});
