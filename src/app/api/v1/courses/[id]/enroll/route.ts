import { withApi } from "@/server/http";
import { enroll } from "@/server/services/progressService";

// POST /courses/:id/enroll - idempotent (201 first time, 200 after)
export const POST = withApi(
  { auth: "required", rateLimit: "write" },
  async (ctx) => {
    const result = await enroll(ctx.user!.id, ctx.params.id!, ctx.now);
    return { data: result.enrollment, status: result.created ? 201 : 200 };
  },
);
