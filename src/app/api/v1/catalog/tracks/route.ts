import { z } from "zod";
import { withApi, parseQuery } from "@/server/http";
import { listTracks } from "@/server/services/catalogService";

const q = z.object({ locale: z.enum(["vi", "en"]).default("vi") });

export const GET = withApi({ auth: "optional", rateLimit: "read" }, async (ctx) => ({
  data: await listTracks(parseQuery(ctx, q).locale ?? "vi"),
}));
