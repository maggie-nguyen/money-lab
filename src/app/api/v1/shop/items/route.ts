import { z } from "zod";
import { withApi, parseQuery } from "@/server/http";
import { listShopItems } from "@/server/services/gamificationQueryService";

const q = z.object({ locale: z.enum(["vi", "en"]).default("vi") });

export const GET = withApi({ auth: "required", rateLimit: "read" }, async (ctx) => ({
  data: await listShopItems(ctx.user!.id, parseQuery(ctx, q).locale ?? "vi"),
}));
