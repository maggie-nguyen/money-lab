import { withApi, parseBody } from "@/server/http";
import { eventsBody, ingestEvents } from "@/server/services/eventService";

// POST /events - doc 03 §11.1. 202 with a per-event rejection list.
export const POST = withApi({ auth: "optional", rateLimit: "events" }, async (ctx) => ({
  data: await ingestEvents(ctx.user?.id ?? null, await parseBody(ctx, eventsBody), ctx.now()),
  status: 202,
}));
