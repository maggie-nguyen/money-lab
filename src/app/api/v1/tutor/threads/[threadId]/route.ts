import { withApi } from "@/server/http";
import { deleteThread, getThread } from "@/server/services/tutorService";

// GET /tutor/threads/:threadId - doc 03 §9.3 (owner only → 404)
export const GET = withApi(
  { auth: "required", rateLimit: "read" },
  async (ctx) => ({ data: await getThread(ctx.user!.id, ctx.params.threadId!) }),
);

// DELETE /tutor/threads/:threadId - doc 03 §9.5
export const DELETE = withApi(
  { auth: "required", rateLimit: "write" },
  async (ctx) => {
    await deleteThread(ctx.user!.id, ctx.params.threadId!);
    return { data: null, status: 204 };
  },
);
