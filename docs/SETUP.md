# Project Setup & Development Guide

## Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- npm 10+

---

## 1. Clone and install

```bash
git clone https://github.com/Seyran23/social-coffee-api.git
cd social-coffee-api
npm install
```

---

## 2. Environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

| Variable                                                                 | Description                                    |
| ------------------------------------------------------------------------ | ---------------------------------------------- |
| `DATABASE_URL`                                                           | PostgreSQL connection string                   |
| `REDIS_HOST` / `REDIS_PORT`                                              | Redis connection                               |
| `JWT_ACCESS_SECRET`                                                      | Random secret, at least 32 chars               |
| `JWT_REFRESH_SECRET`                                                     | Random secret, different from access           |
| `JWT_RESET_SECRET`                                                       | Random secret for password reset               |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Profile image upload                           |
| `CORS_ORIGIN`                                                            | Frontend origin (e.g. `http://localhost:5173`) |

All variables with descriptions are in [`.env.example`](../.env.example).

---

## 3. Database setup

**Create the database**, then run migrations:

```bash
# Apply all pending migrations
npm run prisma:deploy

# Or for local dev (also resets the DB and re-applies):
npm run prisma:migrate
```

**Seed reference data** (interests + admin user):

```bash
# Requires ADMIN_EMAIL and ADMIN_PASSWORD in .env
npm run db:seed
```

**Add dev test fixtures** (10 test users + a test venue):

```bash
npm run db:seed:dev
```

Test users all have the password `Password123!`. The primary test account is `me@test.com`.

---

## 4. Start the server

```bash
# Development (watch mode)
npm run start:dev

# Production build
npm run build
npm run start:prod
```

The server starts on `PORT` (default `8000`).

| URL                                     | Purpose                    |
| --------------------------------------- | -------------------------- |
| `http://localhost:8000/docs`            | Swagger / REST API docs    |
| `http://localhost:8000/v1/health`       | Basic health check         |
| `http://localhost:8000/v1/health/ready` | DB + Redis readiness check |
| `ws://localhost:8000/presence`          | Presence WebSocket         |
| `ws://localhost:8000/chat`              | Chat WebSocket             |

---

## 5. Running tests

```bash
# Unit tests
npm test

# Unit tests with coverage
npm run test:cov

# E2E tests (requires a running DB and Redis)
npm run test:e2e

# All checks (lint + type-check + unit tests)
npm run precheck
```

E2E tests create and clean up their own data. They use `DATABASE_URL` from your `.env`, so point it at a dedicated test database to avoid polluting your dev data.

---

## 6. Useful scripts

| Script                  | What it does                          |
| ----------------------- | ------------------------------------- |
| `npm run lint`          | ESLint with auto-fix                  |
| `npm run type-check`    | TypeScript check with no emit         |
| `npm run prisma:studio` | Prisma Studio (visual DB browser)     |
| `npm run prisma:reset`  | Drop DB, re-run migrations, re-seed   |
| `npm run db:seed:dev`   | Seed dev fixtures on top of base seed |
| `npm run format`        | Prettier format                       |

---

## 7. Commit conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/). The `commit-msg` hook enforces this automatically.

Allowed types: `feat`, `fix`, `refactor`, `perf`, `build`, `test`, `chore`, `ci`, `docs`, `style`

```bash
# Good
git commit -m "feat: add venue search by distance"
git commit -m "fix: handle expired token on WS reconnect"

# Bad (will be rejected)
git commit -m "Fixed stuff"
git commit -m "WIP"
```

Subject max length is **50 characters**.

---

## 8. Project structure

```
src/
├── app.module.ts
├── main.ts
├── common/
│   ├── constants/          # Auth cookie settings, etc.
│   ├── filters/            # HTTP exception filter
│   ├── guards/             # JWT auth guard
│   ├── interceptors/       # Response envelope interceptor
│   ├── middleware/         # WebSocket auth + rate-limit middleware
│   └── utils/              # Sanitize, response builder
├── database/
│   └── prisma.service.ts
└── modules/
    ├── auth/               # Register, login, refresh, reset password
    ├── chat/               # Chat WebSocket gateway + service
    ├── health/             # /health, /health/live, /health/ready
    ├── interaction/        # Like, match detection
    ├── preference/         # User preference CRUD
    ├── presence/           # Presence WebSocket gateway + service
    ├── profile/            # Profile CRUD, image upload, discovery feed
    ├── redis/              # Redis service (presence, session, cache)
    └── venue/              # Venue CRUD, check-in/checkout

prisma/
├── schema.prisma
├── seed.ts                 # Reference data (interests + admin)
├── seed-dev.ts             # Dev-only test fixtures
└── migrations/

test/
├── helpers/                # Shared test utilities
└── *.e2e-spec.ts           # E2E test suites

docs/
├── SETUP.md                # This file
├── INTEGRATION_GUIDE.md    # End-to-end user journey
├── PRESENCE_WEBSOCKET_GUIDE.md
├── CHAT_WEBSOCKET_GUIDE.md
├── API_DOCUMENTATION.md
└── CODE_STYLE.md
```
