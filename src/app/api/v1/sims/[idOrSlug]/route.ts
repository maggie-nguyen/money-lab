import { z } from "zod";
import { withApi, parseQuery } from "@/server/http";
import { getSim } from "@/server/services/simService";

const q = z.object({ locale: z.literal("vi").default("vi") });

export const GET = withApi({ auth: "optional", rateLimit: "read" }, async (ctx) => ({
  data: await getSim(ctx.params.idOrSlug!, ctx.user?.id ?? null, parseQuery(ctx, q).locale ?? "vi"),
}));
