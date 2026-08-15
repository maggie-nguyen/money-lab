import { withApi } from "@/server/http";
import { sendVerificationEmail } from "@/server/services/authService";

export const POST = withApi(
  { auth: "required", rateLimit: "auth" },
  async (ctx) => {
    await sendVerificationEmail(ctx.user!.id, ctx.now());
    return { data: null, status: 202 };
  },
);
