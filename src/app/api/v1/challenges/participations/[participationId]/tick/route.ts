import { z } from "zod";
import { withApi, parseQuery } from "@/server/http";
import { prisma } from "@/server/db";
import { tickChallenge } from "@/server/services/challengeService";
import { AppError } from "@/server/lib/errors";

const q = z.object({ locale: z.literal("vi").default("vi") });

export const POST = withApi({ auth: "required", rateLimit: "write", idempotent: true }, async (ctx) => {
  const locale = parseQuery(ctx, q).locale ?? "vi";
  const result = await prisma.$transaction(async (tx) => {
    try {
      return await tickChallenge(tx, ctx.user!.id, ctx.params.participationId!, ctx.now(), locale);
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw e;
    }
  });
  return { data: result.participation, meta: { awards: result.awards } };
});
