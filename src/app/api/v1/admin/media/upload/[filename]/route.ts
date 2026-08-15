import { withApi } from "@/server/http";
import { storeMediaFile } from "@/server/services/adminOpsService";

// PUT /admin/media/upload/{assetId}.{ext} - raw bytes to public/uploads (doc 03 §14.3).
// Filename is strictly validated in the service (uuid + allow-listed extension, no traversal).

export const PUT = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "write" }, async (ctx) => {
  const bytes = Buffer.from(await ctx.req.arrayBuffer());
  await storeMediaFile(ctx.params.filename ?? "", bytes);
  return { data: { stored: true, bytes: bytes.length } };
});
