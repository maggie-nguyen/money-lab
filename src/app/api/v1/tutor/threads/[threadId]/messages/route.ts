import { z } from "zod";
import { withApi, parseBody, parseQuery } from "@/server/http";
import { sendMessage } from "@/server/services/tutorService";

const body = z.object({ content: z.string().trim().min(1).max(1000) });
const q = z.object({ locale: z.literal("vi").default("vi") });

// Synchronous LLM call - doc 03 §9.4 allows p95 < 8 s on this route only.
export const maxDuration = 30;

// POST /tutor/threads/:threadId/messages
export const POST = withApi(
  { auth: "required", rateLimit: "tutor", idempotent: true },
  async (ctx) => {
    const input = await parseBody(ctx, body);
    const locale = parseQuery(ctx, q).locale ?? "vi";
    return {
      data: await sendMessage(
        ctx.user!.id,
        ctx.params.threadId!,
        input.content,
        locale,
        ctx.now(),
      ),
    };
  },
);
