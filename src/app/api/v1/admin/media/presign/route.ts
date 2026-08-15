import { withApi } from "@/server/http";
import { readJsonBody } from "@/server/services/adminCommon";
import { presignMedia } from "@/server/services/adminOpsService";

// POST /admin/media/presign { fileName, mimeType, bytes } - doc 03 §14.3.
// Lean deploy = local disk, so the "presigned URL" is our own authenticated PUT route.

export const POST = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "write" }, async (ctx) => {
  const body = await readJsonBody(ctx);
  return { data: presignMedia(body) };
});
