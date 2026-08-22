# Active v2 API routes (production)

Canonical list for web and future mobile clients. Full request/response shapes: `03-API-SPEC.md`.
Platform rules: `09-BACKEND-PLATFORM.md`.

## Auth

| Client | Login | Refresh | Logout |
|--------|-------|---------|--------|
| Web | `POST /api/session/login` (cookies) | `POST /api/session/refresh` | `POST /api/session/logout` |
| Mobile | `POST /api/v1/auth/login` (JSON tokens) | `POST /api/v1/auth/refresh` | `POST /api/v1/auth/logout` |

All authenticated `/api/v1/*` calls accept `Authorization: Bearer <accessToken>`.

## Map (public read, auth write)

- `GET /api/v1/food/spots?swLat&swLng&neLat&neLng`
- `GET /api/v1/food/spots/{id}`
- `GET /api/v1/food/clusters`
- `POST /api/v1/food/spots/{id}` — review (auth required)

## Wallet & habits (auth required)

- `GET|PUT /api/v1/me/spending-jars`
- `GET /api/v1/challenges`
- `GET /api/v1/challenges/mine`
- `POST /api/v1/challenges/{slug}/start`
- `POST /api/v1/challenges/participations/{id}/tick`

## Library (public)

- `GET /api/v1/library/articles`
- `GET /api/v1/library/articles/{idOrSlug}`

## Profile (auth required)

- `GET /api/v1/me`
- `GET /api/v1/me/bootstrap`
- `PATCH /api/v1/me`

## Frozen (do not use in new clients)

`/catalog/*`, `/lessons/*`, `/quizzes/*`, `/sims/*`, `/tutor/*`, `/shop/*`, `/leaderboards/*`
