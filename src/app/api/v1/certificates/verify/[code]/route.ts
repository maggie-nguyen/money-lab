import { withApi } from "@/server/http";
import { verifyCertificate } from "@/server/services/certificateService";

// GET /certificates/verify/:code - doc 03 §13.3, public
export const GET = withApi({ auth: "none", rateLimit: "read" }, async (ctx) => ({
  data: await verifyCertificate(ctx.params.code!),
}));
