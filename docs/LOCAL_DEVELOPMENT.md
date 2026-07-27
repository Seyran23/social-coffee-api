# Local Development & Test Data

How to get a working Social Coffee backend with realistic fake data — venues,
people already checked in, chat history, analytics, and a one-tap match — so you
can exercise every feature without a second phone or a real café.

---

## 1. Prerequisites

| Requirement    | Notes                     |
| -------------- | ------------------------- |
| Node.js 20+    | `node -v`                 |
| PostgreSQL 16+ | running locally on `5432` |
| Redis 7+       | running locally on `6379` |

If you'd rather not install Postgres/Redis natively, the repo ships a
`docker-compose.yml`:

```bash
docker compose up -d postgres redis
```

> Its defaults are `social_coffee` / `secret`. If you use it, make `DATABASE_URL`
> in `.env` match those credentials.

---

## 2. First-time setup

```bash
git clone <repo> && cd social-coffee-api
npm install
cp .env.example .env      # then open .env and fill in the values below
```

**Minimum you must set in `.env`:**

| Variable                                                               | Why                                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `DATABASE_URL`                                                         | Postgres connection string                                         |
| `REDIS_HOST` / `REDIS_PORT`                                            | must point at a **local** Redis (seeding refuses to run otherwise) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_RESET_PASSWORD_SECRET` | any long random strings — `openssl rand -base64 48`                |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD`                                       | the admin account the seed creates                                 |

Optional: `CLOUDINARY_*` (profile image upload), `GEMINI_API_KEY` (AI strategy
panel). Everything else works without them.

Then create the schema and load the data:

```bash
npm run prisma:migrate     # apply migrations
npm run db:seed:dev        # ← the one command that loads ALL test data
```

---

## 3. Running it

Three terminals (or background them):

```bash
# 1. keeps the seeded crowd "present" — see the note below
npm run db:presence:keepalive

# 2. the API
npm run start:dev
```

- API: `http://localhost:8000`
- Swagger (dev only): `http://localhost:8000/docs`
- Health: `http://localhost:8000/v1/health/ready`

> **Why the keepalive matters.** Presence lives in Redis and expires ~90s after
> the last heartbeat — that's how the app reaps people who walked out. Seeded
> users have no real app sending heartbeats, so without `db:presence:keepalive`
> running, your feed goes empty a minute after seeding. Leave it running while
> you test.

---

## 4. What the seed gives you

`npm run db:seed:dev` is idempotent — re-run it any time to reset to a clean,
known state.

|                     |                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------- |
| **5 venues**        | clustered in Baku, all `ACTIVE`, with scannable QR codes in `prisma/seed-output/qrcodes/` |
| **~46 users**       | varied ages/genders/interests/preferences, all with password `Password123!`               |
| **40 checked in**   | 8 per venue, so every venue's feed is populated                                           |
| **5 chat sessions** | 3 active + 2 expired, with messages                                                       |
| **Analytics data**  | ~2,400 visits + ~4,300 views + 1 finished campaign on venue #1                            |
| **An armed match**  | see below                                                                                 |

### Accounts

| Account                  | Password              | Use it for                                                                                |
| ------------------------ | --------------------- | ----------------------------------------------------------------------------------------- |
| `me@test.com`            | `Password123!`        | **Your driver account.** Checked in at Gloria Jean's, with 2 people who already liked you |
| `manager@test.com`       | `Password123!`        | Venue dashboard owner (Gloria Jean's)                                                     |
| `manager2@test.com`      | `Password123!`        | Owns a _different_ venue — use to verify 403s                                             |
| `<name>@test.com`        | `Password123!`        | ~40 regular users across the venues                                                       |
| `admin@socialcoffee.com` | from `ADMIN_PASSWORD` | Admin: all venues, assign owners                                                          |

---

## 5. Testing each feature

### Feed & presence

Log in as any `@test.com` user — they're already checked in, so
`GET /profiles/feed` returns the compatible people at their venue. Connect to
the `/presence` WebSocket to get `feed_initial`, then `user_joined` / `user_left`
live.

### Check-in (QR)

`me@test.com` is checked in by the seed, but to test the flow yourself: check out,
then scan a PNG from `prisma/seed-output/qrcodes/` (it encodes the venue id) and
call `POST /venues/:id/checkin` with coordinates within the venue's geofence
(seeded venues use a 150m radius — see `prisma/seed/venues.ts` for their
coordinates).

### Match → chat (no second device needed)

1. Log in as `me@test.com` and connect to `/presence`.
2. Open the feed — **Mia** and **Zoe** are there and have already liked you.
3. Like either one → instant mutual match → **both** sides get a `match_found`
   event (`"You have a match!"`).
4. Connect to `/chat`, `join_chat`, and send a message — **the 10-minute
   countdown starts on that first message**, and both clients get
   `countdown_started`.
5. Check out of the venue → the chat ends for both (`chat_ended`, reason
   `PARTICIPANT_LEFT_VENUE`).

Re-run `npm run db:seed:dev` to re-arm the match.

### Venue analytics dashboard

Log in as `manager@test.com` — `GET /venues/mine` returns their venue, then
`/venues/:id/analytics/overview`, `/traffic-by-hour`, `/age-distribution`,
`/active-users`, and `/campaigns`. The seeded traffic has deliberate quiet hours
and a campaign with a positive lift so every chart has shape.

Try the same requests as `manager2@test.com` against venue #1 to confirm the
ownership guard returns **403**.

### AI strategy panel

Needs `GEMINI_API_KEY` in `.env`. `GET /venues/:id/strategy` generates a plan
from the venue's metrics and caches it for 30 days. Without a key the endpoint
fails soft rather than breaking the dashboard.

---

## 6. Command reference

| Command                         | What it does                                                            |
| ------------------------------- | ----------------------------------------------------------------------- |
| `npm run db:seed`               | Base reference data only (interests + admin) — safe for any environment |
| `npm run db:seed:dev`           | **Everything above.** Idempotent; re-run to reset                       |
| `npm run db:reset:dev`          | Drop the DB, re-run migrations, re-seed from scratch                    |
| `npm run db:presence:keepalive` | Keeps seeded users "present" — run while testing                        |
| `npm run db:cleanup:test-data`  | Remove seeded test data                                                 |
| `npm run start:dev`             | API in watch mode                                                       |
| `npm run precheck`              | Lint + type-check + unit tests                                          |
| `npm run test:e2e`              | E2E suite (needs DB + Redis)                                            |
| `npm run prisma:studio`         | Browse the database                                                     |

---

## 7. Troubleshooting

**Feed is empty / nobody is at the venue**
Presence expired. Run `npm run db:presence:keepalive` (and keep it running), or
re-run `npm run db:seed:dev`.

**`Cannot find module dist/main` on start**
Stale incremental build cache. `rm -f tsconfig.build.tsbuildinfo` then
`npm run start:dev`.

**`EADDRINUSE :::8000`**
Another API instance is running. `pkill -f "nest start"` then start again.

**Seeding refuses to run**
By design when `NODE_ENV=production` or `REDIS_HOST` points at a hosted Redis
(e.g. Upstash). Seeding writes fake users into presence — point `REDIS_HOST` at
a local Redis.

**A CORS error in the browser**
Usually the API is simply down — a failed request has no CORS headers to read.
Check `curl http://localhost:8000/v1/health/ready` first. If the API is up, add
your frontend origin to `CORS_ORIGIN` in `.env`.

**Migration drift / "database schema is not in sync"**
`npm run db:reset:dev` (destroys local data and rebuilds).
