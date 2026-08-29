import { withApi } from "@/server/http";

/** Courses were removed; keep the endpoint so profile does not 404. */
export const GET = withApi({ auth: "required", rateLimit: "read" }, async () => ({
  data: [],
}));
