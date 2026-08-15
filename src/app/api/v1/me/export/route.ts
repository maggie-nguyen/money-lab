import { withApi, jsonResponse } from "@/server/http";
import { exportMe } from "@/server/services/meService";

export const GET = withApi(
  { auth: "required", rateLimit: "write" },
  async (ctx) => {
    const dump = await exportMe(ctx.user!.id);
    return jsonResponse({ data: dump }, 200, {
      "content-disposition": 'attachment; filename="moneylab-export.json"',
      "x-request-id": ctx.requestId,
    });
  },
);
