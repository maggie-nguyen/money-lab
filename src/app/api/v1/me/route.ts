import { z } from "zod";
import { withApi, parseBody } from "@/server/http";
import { displayNameSchema } from "@/server/schemas/auth";
import { getMe, patchMe, deleteMe } from "@/server/services/meService";
import { AppError } from "@/server/lib/errors";

export const GET = withApi({ auth: "required", rateLimit: "read" }, async (ctx) => ({
  data: await getMe(ctx.user!.id),
}));

const patchSchema = z.object({
  displayName: displayNameSchema.optional(),
  avatarKey: z.string().max(30).optional(),
  birthYear: z.number().int().min(1940).max(2020).nullable().optional(),
  province: z.string().trim().max(50).nullable().optional(),
});

export const PATCH = withApi({ auth: "required", rateLimit: "write" }, async (ctx) => {
  const input = await parseBody(ctx, patchSchema);
  return { data: await patchMe(ctx.user!.id, input) };
});

const deleteSchema = z.object({ confirm: z.string() });

export const DELETE = withApi({ auth: "required", rateLimit: "write" }, async (ctx) => {
  const input = await parseBody(ctx, deleteSchema);
  if (input.confirm !== "DELETE") {
    throw new AppError("VALIDATION_ERROR", 'confirm must be exactly "DELETE"');
  }
  return { data: await deleteMe(ctx.user!.id, ctx.now), status: 202 };
});
