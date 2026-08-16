import { withApi } from "@/server/http";
import { purchaseItem } from "@/server/services/gamificationQueryService";

// POST - atomic purchase. Idempotency-Key supported; consumables must key on
// the copy being bought, not the item, or the second purchase replays the first.
export const POST = withApi(
  { auth: "required", rateLimit: "write", idempotent: true },
  async (ctx) => ({ data: await purchaseItem(ctx.user!.id, ctx.params.id!, ctx.now), status: 201 }),
);
