import { withApi, parseQuery, type ApiCtx } from "@/server/http";
import { notFound } from "@/server/lib/errors";
import { adminListQuery, readJsonBody, type AdminActor } from "@/server/services/adminCommon";
import { isAdminResource, resourceFor } from "@/server/services/adminContentService";

// GET/POST /admin/{res} - doc 03 §14.1. {res} dispatches into the resource registry;
// unknown segments 404 (static admin routes like /admin/users win over this one).

function resolve(ctx: ApiCtx) {
  const res = ctx.params.res ?? "";
  if (!isAdminResource(res)) throw notFound("Resource");
  return resourceFor(res);
}
const actorOf = (ctx: ApiCtx): AdminActor => ({ id: ctx.user!.id, ip: ctx.ip });

export const GET = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "read" }, async (ctx) => {
  const impl = resolve(ctx);
  const q = parseQuery(ctx, adminListQuery);
  const { data, nextCursor } = await impl.list(q);
  return { data, meta: { nextCursor } };
});

export const POST = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "write" }, async (ctx) => {
  const impl = resolve(ctx);
  const body = await readJsonBody(ctx);
  const data = await impl.create(body, actorOf(ctx), ctx.now());
  return { data, status: 201 };
});
