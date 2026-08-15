import { withApi } from "@/server/http";
import { PROVINCES } from "@/server/lib/meta";

// GET /meta/provinces - doc 03 §12. Static; cache hard at the edge.
export const GET = withApi({ auth: "none" }, async () =>
  Response.json(
    { data: PROVINCES.map((p) => ({ key: p.key, label: p.vi })) },
    { headers: { "cache-control": "public, max-age=86400, s-maxage=86400" } },
  ),
);
