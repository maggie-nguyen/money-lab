import { z } from "zod";
import { withApi, parseQuery } from "@/server/http";
import { getTrack } from "@/server/services/catalogService";

const q = z.object({ locale: z.literal("vi").default("vi") });

export const GET = withApi({ auth: "optional", rateLimit: "read" }, async (ctx) => ({
  data: await getTrack(
    ctx.params.idOrSlug!,
    parseQuery(ctx, q).locale ?? "vi",
    ctx.user?.id ?? null,
  ),
}));
