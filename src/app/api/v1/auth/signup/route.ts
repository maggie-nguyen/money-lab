import { withApi, parseBody } from "@/server/http";
import { signupSchema } from "@/server/schemas/auth";
import { signup } from "@/server/services/authService";

export const POST = withApi({ auth: "none", rateLimit: "auth" }, async (ctx) => {
  const input = await parseBody(ctx, signupSchema);
  const result = await signup(input, ctx.now, {
    userAgent: ctx.req.headers.get("user-agent") ?? undefined,
    ip: ctx.ip,
  });
  return { data: result, status: 201 };
});
