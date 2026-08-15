import { withApi, parseQuery } from "@/server/http";
import { auditQuery, listAuditLog } from "@/server/services/adminOpsService";

// GET /admin/audit-log?entityType=&entityId=&actorId=&action=&cursor= - doc 03 §14.7.

export const GET = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "read" }, async (ctx) => {
  const q = parseQuery(ctx, auditQuery);
  const { data, nextCursor } = await listAuditLog(q);
  return { data, meta: { nextCursor } };
});
