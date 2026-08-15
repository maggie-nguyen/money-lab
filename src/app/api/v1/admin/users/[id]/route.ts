import { withApi } from "@/server/http";
import { readJsonBody } from "@/server/services/adminCommon";
import { adminDeleteUser, getUser, patchUser } from "@/server/services/adminOpsService";

// GET/PATCH/DELETE /admin/users/{id} - doc 03 §14.4.

export const GET = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "read" }, async (ctx) => {
  return { data: await getUser(ctx.params.id ?? "") };
});

export const PATCH = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "write" }, async (ctx) => {
  const body = await readJsonBody(ctx);
  const data = await patchUser(ctx.params.id ?? "", body, { id: ctx.user!.id, ip: ctx.ip }, ctx.now());
  return { data };
});

export const DELETE = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "write" }, async (ctx) => {
  await adminDeleteUser(ctx.params.id ?? "", { id: ctx.user!.id, ip: ctx.ip }, ctx.now());
  return { data: null, status: 204 };
});
