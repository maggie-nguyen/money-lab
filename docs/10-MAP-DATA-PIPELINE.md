# Map import pipeline — cheapest meal near campus

MoneyLab map is a **student-budget food map**, not Google Maps. A pin means **we know what you pay**.

## Product rule

| On `/ban-do` | Not stored / deleted |
|--------------|----------------------|
| Food with `avgPriceVnd` | OSM restaurants with no price |
| School linked to priced food | Schools with no priced food nearby |

**No price → no pin → no row.** Community forum adds prices; that makes spots appear.

**Verified-physical only for Foody.** Curated + OSM sources are trusted (manually researched/surveyed). Foody spots only appear once written `verified` — Foody lists virtual/ghost kitchens with no walk-in storefront, so a Foody pin without an OSM confirmation is kept in the DB but never shown. `map:verify:physical` (OSM) progressively confirms pins from the cached food dumps and Overpass ground truth; each run is resumable and `verified` flips on so the map grows automatically.

**Meals only, physical only, student budget, no images.** Drink stalls (trà sữa, cà phê, nước ép…), online-only shops, out-of-city coordinates and any spot over **60k VND** are excluded. A 60k ceiling is the hard product rule — a student meal pin is capped there, so buffets/big-group spots can't pollute the map. Physical existence is confirmed against OSM (`map:verify:physical`). Google is intentionally **not** used: the project runs on a Maps Demo key (prototyping quota) and no billing, so Google verification/photos are out of scope. Thus the map carries **no images** — price + location + name only.

Run `pnpm map:prune:budget` after any import to enforce the 60k ceiling (drops leftovers such as buffets that snuck in via older seeds).

**The 60k ceiling is now a query-time invariant, not just import-time.** `mapVisibleSpotWhere` (used by every map list/count endpoint) enforces `avgPriceVnd <= 60k` AND excludes unverified foody spots, so nothing over budget or ghost-kitchen can ever render — even if a bad row slips into the DB. Community submissions are validated against the same ceiling at the API layer.

Reviews are optional. **Price is the product.**

## Data sources

| Source | Use |
|--------|-----|
| **Curated** (HUST library, student-area listings, manual seed) | Launch food with real prices |
| **Foody.vn crawl** | Bulk physical stores with per-person price ranges (cheap band only) — `pnpm map:crawl:foody` then `pnpm map:import:foody` |
| **Student submissions** | `priceVnd` on review → updates `avgPriceVnd` → pin appears |
| **OSM** | School coords only (`pnpm map:import`) — **not** food POIs |
| **MOET / HCMC THPT** | School anchors (THPT) |
| **Wikidata** | Optional major campus gap-fill |

## Commands

```bash
pnpm map:import              # OSM schools only (no food bulk)
pnpm map:import:hust         # Priced spots near ĐH Bách Khoa
pnpm map:import:student-listings # Priced spots near Cầu Giấy/Chùa Láng/Mỹ Đình + Q.10/Thủ Đức/Gò Vấp
pnpm map:crawl:foody         # Crawl Foody.vn listing+store pages into prisma/data/foody/*.json (resumable)
pnpm map:import:foody        # Import cheap (≤60k avg), physical, meal-only Foody spots
pnpm map:verify:physical     # OSM cross-match of Foody pins → verified=true (independently surveyed POIs)
pnpm map:purge:drinks        # Remove drink-only pins (trà sữa/cà phê…) — map is meals only
pnpm map:import:hcmc-schools # HCMC THPT enrichment
pnpm map:import:prune        # Delete all food spots without avgPriceVnd
pnpm map:import:saigon-listings # Priced spots near HCMC campuses
pnpm map:import:link         # Rebuild spot↔school links
pnpm exec tsx scripts/map-import/count.ts
```

## Launch checklist

1. Run migrations (`20260822140000_map_schools`) on staging/prod.
2. Seed priced food: `pnpm map:import:hust`, `pnpm map:import:saigon-listings`.
3. Rebuild links: `pnpm map:import:link`.
4. Verify counts: `pnpm exec tsx scripts/map-import/count.ts` — `mapVisibleSpots` should equal `pricedSpots`.
5. Community growth: `/ban-do/them-quan` (POST `/api/v1/food/spots`) and reviews with required `priceVnd`.
6. Do **not** bulk-import OSM restaurants; run `pnpm map:import:prune` if unpriced rows creep in.

Local MOET PDF / OSM JSON caches: gitignored under `prisma/data/`.
