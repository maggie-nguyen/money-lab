import { withApi } from "@/server/http";
import { readJsonBody } from "@/server/services/adminCommon";
import { confirmMedia } from "@/server/services/adminOpsService";

// POST /admin/media/{assetId}/confirm - creates the media_asset row after upload (doc 03 §14.3).

export const POST = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "write" }, async (ctx) => {
  const body = await readJsonBody(ctx);
  const data = await confirmMedia(ctx.params.assetId ?? "", body, { id: ctx.user!.id, ip: ctx.ip }, ctx.now());
  return { data, status: 201 };
});
