import { withApi, type ApiCtx } from "@/server/http";
import { notFound } from "@/server/lib/errors";
import { readJsonBody, type AdminActor } from "@/server/services/adminCommon";
import { isAdminResource, resourceFor } from "@/server/services/adminContentService";

// GET/PATCH/DELETE /admin/{res}/{id} - doc 03 §14.1.
// PATCH requires If-Match (etag = updatedAt millis) on models that version.

function resolve(ctx: ApiCtx) {
  const res = ctx.params.res ?? "";
  if (!isAdminResource(res)) throw notFound("Resource");
  return { impl: resourceFor(res), id: ctx.params.id ?? "" };
}
const actorOf = (ctx: ApiCtx): AdminActor => ({ id: ctx.user!.id, ip: ctx.ip });

export const GET = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "read" }, async (ctx) => {
  const { impl, id } = resolve(ctx);
  return { data: await impl.get(id) };
});

export const PATCH = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "write" }, async (ctx) => {
  const { impl, id } = resolve(ctx);
  const body = await readJsonBody(ctx);
  const data = await impl.patch(id, body, ctx.req.headers.get("if-match"), actorOf(ctx), ctx.now());
  return { data };
});

export const DELETE = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "write" }, async (ctx) => {
  const { impl, id } = resolve(ctx);
  await impl.remove(id, actorOf(ctx), ctx.now());
  return { data: null, status: 204 };
});
