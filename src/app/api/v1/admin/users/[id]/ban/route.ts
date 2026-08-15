import { withApi } from "@/server/http";
import { readJsonBody } from "@/server/services/adminCommon";
import { banUser } from "@/server/services/adminOpsService";

// POST /admin/users/{id}/ban { reason } - revokes refresh tokens; login blocked - doc 03 §14.4.

export const POST = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "write" }, async (ctx) => {
  const body = await readJsonBody(ctx);
  const data = await banUser(ctx.params.id ?? "", body, { id: ctx.user!.id, ip: ctx.ip }, ctx.now());
  return { data };
});
