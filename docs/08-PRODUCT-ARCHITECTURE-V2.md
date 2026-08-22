# MoneyLab v2 — Product & Web Architecture

> **Status:** Active pivot (Aug 2026). Supersedes the LMS-first mental model in `00-OVERVIEW.md` for **navigation and MVP priority**. Core stack conventions in `01-ARCHITECTURE.md` still apply.
>
> **Backend, database, scaling, and mobile API contract:** see **`09-BACKEND-PLATFORM.md`** (production platform doc).

---

## 1. Product definition (one paragraph)

MoneyLab is a **Vietnamese-first, phone-first web app for học sinh THPT** (sinh viên secondary) to **spend smarter day-to-day**: discover **cheap eats on a map** (Beggar Map / 거지맵 style), **understand why money disappears**, **split allowance into jars**, and **build savings habits**. The **map is a first-class pillar**, not a sub-page of a list.

---

## 2. Four pillars (equal weight)

| # | Pillar | Route | Purpose |
|---|--------|-------|---------|
| P1 | **Bản đồ ăn rẻ** | `/ban-do` | Google Map, price pins, community reviews — **hero experience** |
| P2 | **Hiểu mình** | `/vi-cua-toi/hieu-minh` | Spending psychology (FOMO, stress, cards, YOLO) |
| P3 | **Chia ví** | `/vi-cua-toi/chia-vi` | Monthly spending jars + warnings |
| P4 | **Thói quen** | `/vi-cua-toi/thu-thach` | Savings challenges + daily ticks |

**Hub:** `/vi-cua-toi` links pillars P2–P4. P1 (map) has its own top-level route and nav slot.

`/vi-cua-toi/cuoc-song` becomes a **non-map life tips** page; food discovery moves entirely to `/ban-do`.

---

## 3. Information architecture (routes)

```
Public (no login required to browse map)
├── /                         Landing — map + wallet value prop
├── /ban-do                   Full-screen Google Map (primary)
├── /ban-do/spot/[spotId]     Spot detail + reviews (browse public; review = login)
├── /library                  Articles (psychology, optional)
└── /login, /signup

Authenticated
├── /vi-cua-toi               Wallet hub (pillars P2–P4)
├── /vi-cua-toi/hieu-minh
├── /vi-cua-toi/chia-vi
├── /vi-cua-toi/thu-thach
├── /vi-cua-toi/cuoc-song     Life tips (transport, fun, study — no food map)
├── /profile, /settings
└── /admin                    Spot/review moderation (ADMIN)

Deprecated (redirect, code kept frozen)
├── /learn, /course/*, /lesson/*   → /vi-cua-toi
├── /sims/*                        → /vi-cua-toi
├── /tools/*                       → /vi-cua-toi/chia-vi
├── /tutor, /shop, /quests, /leaderboard → /vi-cua-toi
└── /vi-cua-toi/cuoc-song/an-uong/* → /ban-do/*
```

---

## 4. Navigation shell

### Mobile bottom nav (4 items)

| Slot | Label (vi) | Route |
|------|------------|-------|
| 1 | Bản đồ | `/ban-do` |
| 2 | Ví | `/vi-cua-toi` |
| 3 | Thử thách | `/vi-cua-toi/thu-thach` |
| 4 | Tài khoản | `/profile` |

`MapShell` wraps `/ban-do` (full viewport, no `max-w-6xl`).  
`AppShell` wraps wallet/profile (standard padded layout).

### Desktop header

Same four links + wordmark → `/ban-do`.

---

## 5. Map pillar — technical design

### 5.1 UX flow

1. Open `/ban-do` → map fills screen, centered on geolocation or user's province.
2. Pan/zoom → debounced fetch pins in viewport (`bbox` API).
3. Tap pin → bottom sheet: name, avg price, rating, “Xem chi tiết”.
4. Detail page → reviews; **POST review requires auth**.
5. Filter chips: `< 25k`, `< 35k`, cơm, phở, trà sữa (client filter on loaded pins).

### 5.2 Google Maps (cost-minimized)

| Decision | Rationale |
|----------|-----------|
| **Maps JavaScript API only** | No Places, Geocoding, or Directions in v1 |
| **Dynamic import on `/ban-do` only** | Zero map cost on other pages |
| **Browser geolocation** | Free; no Google Geolocation API |
| **Postgres bbox query** | No Google server calls for pin data |
| **Pin data cached client-side per session** | Merge bbox results, avoid refetch |
| **API key restricted by HTTP referrer** | Prevent quota theft |
| **No map on SSR** | Client-only `APIProvider` |

**Expected cost at low traffic:** Google gives **$200/month free credit** ≈ 28k map loads. At hundreds of users, cost stays **$0**.

**Env:** `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (Maps JavaScript API enabled in Cloud Console).

**CSP additions:** `script-src` + `connect-src` + `img-src` for `https://maps.googleapis.com` and `https://maps.gstatic.com`.

### 5.3 Data model

```
FoodCluster (city preset: Sài Gòn | Hà Nội)
  └── FoodSpot (required lat, lng for map)
        └── FoodReview (rating, body, priceVnd)
```

**Migration:** add `lat`, `lng` (nullable first, required for new seeds) + index `(lat, lng)`.

**API:**

- `GET /api/v1/food/spots?swLat&swLng&neLat&neLng&locale` — pins in bounds (public)
- Existing cluster/spot routes kept for admin; map uses bbox endpoint

**No PostGIS** — simple `BETWEEN` on lat/lng is enough at <5k spots.

### 5.4 Future (not v1)

- User-submitted spots (moderation queue)
- `@googlemaps/markerclusterer` when pin count > 100
- Places Autocomplete on “Thêm quán” (costs money — defer)
- Deal/tip board per school area

---

## 6. Cost-minimized platform stack

| Service | Choice | Cost at low scale |
|---------|--------|-------------------|
| Hosting | Vercel Hobby / Pro | $0 → scale with traffic |
| Database | **Neon Postgres** (Singapore, pooled) | Free tier → paid at scale |
| Maps | Google Maps JS (free tier) | $0 at low traffic |
| Auth | JWT + Google Sign-In (web cookies + mobile Bearer) | $0 |
| Email | Resend (verification only) | ~$0 |
| AI Tutor | **Disabled** (`ai_tutor_enabled=false`) | $0 |
| File storage | None for map v1 | $0 |
| Analytics | First-party `event` table | $0 |

**Production backend design (scaling, mobile clients, schema domains):** `09-BACKEND-PLATFORM.md`.

**Removed from active product (frozen, not deleted):** sims engines, LMS catalog, shop, leaderboard, tutor — high maintenance and/or API cost, off-pillar for v2. Legacy tables remain; v2 seed does not populate them.

---

## 7. Content strategy

| Content | Source | Status |
|---------|--------|--------|
| Map spots | `prisma/seed-food.ts` + future UGC | Seed in v1 |
| Psychology articles | `content/vi/articles.json` | Write HS-focused slugs |
| Mock LMS courses | `content/vi/nen-tang-tien-bac/*` | **Do not seed**; archive |
| Library articles | `articles.json` | Empty until real articles |

---

## 8. Privacy (map-specific)

- Map browsing: **no location stored server-side**; geolocation stays in browser.
- Reviews: existing user id + display name only.
- No school name free-text from users in v1 (use cluster presets).

---

## 9. Implementation phases

| Phase | Deliverable |
|-------|-------------|
| **0** | This doc + todo list |
| **1** | Schema (`lat`/`lng`), bbox API, seed spots |
| **2** | `/ban-do` Google Map page + MapShell |
| **3** | Nav/landing pivot, redirects from old routes |
| **4** | Spot detail at `/ban-do/spot/[id]`, review flow |
| **5** | i18n, filters, polish |
| **6** | Psychology articles + challenge seed |
| **7** | Admin: approve user-submitted spots (later) |

---

## 10. Success criteria (v2 MVP)

- [ ] `/ban-do` loads map with seeded pins in **Sài Gòn + Hà Nội** (2 cities only in v1)
- [ ] Pan map → new pins load without full page refresh
- [ ] Tap pin → see price + link to detail
- [ ] Logged-in user can post review with price
- [ ] Mobile bottom nav: Map / Ví / Thử thách / Tài khoản
- [ ] `/learn` redirects to `/vi-cua-toi`
- [ ] Google Maps cost = $0 at dev/staging traffic
