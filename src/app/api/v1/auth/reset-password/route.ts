import { withApi, parseBody } from "@/server/http";
import { resetPasswordSchema } from "@/server/schemas/auth";
import { resetPassword } from "@/server/services/authService";

export const POST = withApi({ auth: "none", rateLimit: "auth" }, async (ctx) => {
  const input = await parseBody(ctx, resetPasswordSchema);
  await resetPassword(input, ctx.now);
  return { data: { reset: true } };
});
