import { withApi, parseQuery } from "@/server/http";
import { adminUsersQuery, listUsers } from "@/server/services/adminOpsService";

// GET /admin/users?q=&role=&status=&cursor= - doc 03 §14.4.

export const GET = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "read" }, async (ctx) => {
  const q = parseQuery(ctx, adminUsersQuery);
  const { data, nextCursor } = await listUsers(q);
  return { data, meta: { nextCursor } };
});
