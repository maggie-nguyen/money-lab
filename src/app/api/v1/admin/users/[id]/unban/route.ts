import { withApi } from "@/server/http";
import { unbanUser } from "@/server/services/adminOpsService";

// POST /admin/users/{id}/unban - reverse of ban; user must sign in again for tokens.

export const POST = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "write" }, async (ctx) => {
  const data = await unbanUser(ctx.params.id ?? "", { id: ctx.user!.id, ip: ctx.ip }, ctx.now());
  return { data };
});
