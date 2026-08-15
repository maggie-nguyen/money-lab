import { withApi } from "@/server/http";
import { AVATARS } from "@/server/lib/meta";

// GET /meta/avatars - doc 03 §12
export const GET = withApi({ auth: "none" }, async () =>
  Response.json(
    { data: AVATARS },
    { headers: { "cache-control": "public, max-age=86400, s-maxage=86400" } },
  ),
);
