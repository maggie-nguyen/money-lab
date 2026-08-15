import { withApi } from "@/server/http";
import { purchaseItem } from "@/server/services/gamificationQueryService";

// POST - atomic purchase; guests cannot buy. Idempotency-Key supported.
export const POST = withApi(
  { auth: "required", rateLimit: "write", idempotent: true },
  async (ctx) => ({ data: await purchaseItem(ctx.user!.id, ctx.params.id!, ctx.now), status: 201 }),
);
