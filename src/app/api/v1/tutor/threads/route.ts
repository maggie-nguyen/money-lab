import { z } from "zod";
import { withApi, parseBody, parseQuery } from "@/server/http";
import { createThread, listThreads } from "@/server/services/tutorService";

const body = z.object({
  contextType: z.enum(["GENERAL", "LESSON", "SIM_SESSION"]),
  contextId: z.string().max(64).optional().nullable(),
});

const q = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  locale: z.literal("vi").default("vi"),
});

// POST /tutor/threads - doc 03 §9.1
export const POST = withApi(
  { auth: "required", rateLimit: "write" },
  async (ctx) => {
    const input = await parseBody(ctx, body);
    const locale = parseQuery(ctx, q).locale ?? "vi";
    return { data: await createThread(ctx.user!.id, input, locale, ctx.now()), status: 201 };
  },
);

// GET /tutor/threads - doc 03 §9.2, newest first
export const GET = withApi(
  { auth: "required", rateLimit: "read" },
  async (ctx) => {
    const query = parseQuery(ctx, q);
    // The list itself is the payload and paging goes in meta, same as every
    // other list endpoint. The client maps over data directly.
    const { items, nextCursor, hasMore } = await listThreads(
      ctx.user!.id,
      query.cursor,
      query.limit ?? 20,
    );
    return { data: items, meta: { nextCursor, hasMore } };
  },
);
