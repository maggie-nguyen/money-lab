import { z } from "zod";
import { withApi, parseQuery } from "@/server/http";
import { listMyCertificates } from "@/server/services/certificateService";

const q = z.object({ locale: z.enum(["vi", "en"]).default("vi") });

// GET /me/certificates - doc 03 §13.2
export const GET = withApi({ auth: "required", rateLimit: "read" }, async (ctx) => ({
  data: await listMyCertificates(ctx.user!.id, parseQuery(ctx, q).locale ?? "vi"),
}));
