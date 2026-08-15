import { withApi, parseBody } from "@/server/http";
import { logoutSchema } from "@/server/schemas/auth";
import { logout } from "@/server/services/authService";

export const POST = withApi({ auth: "required", rateLimit: "auth" }, async (ctx) => {
  const input = await parseBody(ctx, logoutSchema);
  await logout(ctx.user!.id, input, ctx.now);
  return { data: null, status: 200 };
});
