import { withApi, parseBody } from "@/server/http";
import { verifyEmailSchema } from "@/server/schemas/auth";
import { verifyEmail } from "@/server/services/authService";

export const POST = withApi({ auth: "none", rateLimit: "auth" }, async (ctx) => {
  const input = await parseBody(ctx, verifyEmailSchema);
  await verifyEmail(input, ctx.now);
  return { data: { verified: true } };
});
