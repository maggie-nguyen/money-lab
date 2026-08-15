import { withApi } from "@/server/http";
import { getUsage } from "@/server/services/tutorService";

// GET /tutor/usage - doc 03 §9.6
export const GET = withApi(
  { auth: "required", rateLimit: "read" },
  async (ctx) => ({ data: await getUsage(ctx.user!.id, ctx.now()) }),
);
