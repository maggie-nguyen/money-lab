# Map import pipeline — cheapest meal near campus

MoneyLab map is a **student-budget food map**, not Google Maps. A pin means **we know what you pay**.

## Product rule

| On `/ban-do` | Not stored / deleted |
|--------------|----------------------|
| Food with `avgPriceVnd` | OSM restaurants with no price |
| School linked to priced food | Schools with no priced food nearby |

**No price → no pin → no row.** Community forum adds prices; that makes spots appear.

Reviews are optional. **Price is the product.**

## Data sources

| Source | Use |
|--------|-----|
| **Curated** (HUST library, manual seed) | Launch food with real prices |
| **Student submissions** | `priceVnd` on review → updates `avgPriceVnd` → pin appears |
| **OSM** | School coords only (`pnpm map:import`) — **not** food POIs |
| **MOET / HCMC THPT** | School anchors (THPT) |
| **Wikidata** | Optional major campus gap-fill |

## Commands

```bash
pnpm map:import              # OSM schools only (no food bulk)
pnpm map:import:hust         # Priced spots near ĐH Bách Khoa
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
