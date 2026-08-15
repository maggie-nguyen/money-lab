import { withApi, parseQuery, jsonResponse, type ApiCtx } from "@/server/http";
import { notFound } from "@/server/lib/errors";
import { type AdminActor } from "@/server/services/adminCommon";
import { isAdminResource, resourceFor } from "@/server/services/adminContentService";
import { listSurveyResponses, surveyResponsesCsv, surveyResponsesQuery } from "@/server/services/adminOpsService";

// POST /admin/{res}/{id}/{publish|unpublish|archive} - lifecycle (doc 03 §14.1).
// GET  /admin/surveys/{id}/responses[?format=csv] - doc 03 §14.5 (lives here because
// /admin/surveys/* is served by the dynamic {res} tree).

const LIFECYCLE = new Set(["publish", "unpublish", "archive"]);
const actorOf = (ctx: ApiCtx): AdminActor => ({ id: ctx.user!.id, ip: ctx.ip });

export const POST = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "write" }, async (ctx) => {
  const res = ctx.params.res ?? "";
  const action = ctx.params.action ?? "";
  if (!isAdminResource(res) || !LIFECYCLE.has(action)) throw notFound("Action");
  const impl = resourceFor(res);
  if (!impl.lifecycle) throw notFound("Action"); // modules/questions/badges have no status
  const body = await ctx.req.json().catch(() => ({}));
  const data = await impl.lifecycle(
    ctx.params.id ?? "",
    action as "publish" | "unpublish" | "archive",
    body,
    actorOf(ctx),
    ctx.now(),
  );
  return { data };
});

export const GET = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "read" }, async (ctx) => {
  if (ctx.params.res !== "surveys" || ctx.params.action !== "responses") throw notFound("Action");
  const q = parseQuery(ctx, surveyResponsesQuery);
  const surveyId = ctx.params.id ?? "";
  if (q.format === "csv") {
    const { filename, csv } = await surveyResponsesCsv(surveyId);
    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  }
  const { survey, data, nextCursor } = await listSurveyResponses(surveyId, q);
  return jsonResponse({ data, meta: { survey, nextCursor } }, 200);
});
