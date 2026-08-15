import { withApi } from "@/server/http";
import { listFlags } from "@/server/services/adminOpsService";

// GET /admin/flags - all keys (defaults merged with DB overrides) - doc 03 §14.7.

export const GET = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "read" }, async () => {
  const { data } = await listFlags();
  return { data };
});
