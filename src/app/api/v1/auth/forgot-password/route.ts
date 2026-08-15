import { withApi, parseBody } from "@/server/http";
import { forgotPasswordSchema } from "@/server/schemas/auth";
import { forgotPassword } from "@/server/services/authService";

export const POST = withApi({ auth: "none", rateLimit: "auth" }, async (ctx) => {
  const input = await parseBody(ctx, forgotPasswordSchema);
  await forgotPassword(input, ctx.now);
  // Always 204-shaped success - no account enumeration (doc 03 §1.10)
  return { data: null, status: 200 };
});
