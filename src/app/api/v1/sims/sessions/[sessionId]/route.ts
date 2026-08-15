import { z } from "zod";
import { withApi, parseQuery } from "@/server/http";
import { getSession } from "@/server/services/simService";

const q = z.object({ locale: z.enum(["vi", "en"]).default("vi") });

export const GET = withApi({ auth: "required", rateLimit: "read" }, async (ctx) => ({
  data: await getSession(ctx.user!.id, ctx.params.sessionId!, parseQuery(ctx, q).locale ?? "vi"),
}));
