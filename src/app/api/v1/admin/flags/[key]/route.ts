import { withApi } from "@/server/http";
import { notFound } from "@/server/lib/errors";
import { prisma } from "@/server/db";
import { FLAG_DEFAULTS } from "@/server/lib/flags";
import { readJsonBody } from "@/server/services/adminCommon";
import { putFlag } from "@/server/services/adminOpsService";

// GET/PUT /admin/flags/{key} - doc 03 §14.7. PUT upserts and drops the in-process cache.

export const GET = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "read" }, async (ctx) => {
  const key = ctx.params.key ?? "";
  const row = await prisma.featureFlag.findUnique({ where: { key } });
  if (!row && !(key in FLAG_DEFAULTS)) throw notFound("Flag");
  return {
    data: {
      key,
      enabled: row?.enabled ?? FLAG_DEFAULTS[key] ?? false,
      payload: row?.payload ?? null,
      isDefault: !row,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    },
  };
});

export const PUT = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "write" }, async (ctx) => {
  const body = await readJsonBody(ctx);
  const data = await putFlag(ctx.params.key ?? "", body, { id: ctx.user!.id, ip: ctx.ip }, ctx.now());
  return { data };
});
