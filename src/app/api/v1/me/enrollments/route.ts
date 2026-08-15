import { z } from "zod";
import { withApi, parseQuery } from "@/server/http";
import { listEnrollments } from "@/server/services/progressService";

const q = z.object({ locale: z.enum(["vi", "en"]).default("vi") });

export const GET = withApi({ auth: "required", rateLimit: "read" }, async (ctx) => ({
  data: await listEnrollments(ctx.user!.id, parseQuery(ctx, q).locale ?? "vi"),
}));
