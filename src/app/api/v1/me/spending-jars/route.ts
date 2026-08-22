import { z } from "zod";
import { withApi, parseBody, parseQuery } from "@/server/http";
import { getSpendingJar, saveSpendingJar, spendingJarBodySchema } from "@/server/services/spendingJarService";

const q = z.object({ locale: z.literal("vi").default("vi") });

export const GET = withApi({ auth: "required", rateLimit: "read" }, async (ctx) => {
  const locale = parseQuery(ctx, q).locale ?? "vi";
  return { data: await getSpendingJar(ctx.user!.id, locale) };
});

export const PUT = withApi({ auth: "required", rateLimit: "write" }, async (ctx) => {
  const input = await parseBody(ctx, spendingJarBodySchema);
  return { data: await saveSpendingJar(ctx.user!.id, input) };
});
