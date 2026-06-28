# BookIt

A live event booking platform (a simplified Eventbrite). Organizers create events
with limited seating; users browse, search, and book seats. The booking endpoint
is concurrency‑safe: **the last seat can only ever be sold once.**

Built with **Next.js 16** (App Router — UI + a thin proxy API), an **Express 5**
backend, **PostgreSQL 16**, **Prisma 7**, and **Auth.js (NextAuth v5)**.

**Architecture:** the browser only ever talks to Next.js; the Next API routes
*proxy* to a separate Express backend, which is the only process that touches the
database. So the backend stays decoupled from the frontend and can run on a
private network in production.

```
browser ──▶ Next.js (UI + Auth.js + proxy API, :3000) ──▶ Express backend (:4000) ──▶ Postgres
```

> For the *why* behind the architecture, concurrency design, schema, and indexes,
> see [NOTES.md](NOTES.md) (start with §1.1).

---

## Quick start (Docker Compose — recommended)

This is the cold path. From nothing to a seeded, running app in three commands.
**You only need Docker installed** (Docker Desktop / Docker Engine with the
Compose plugin). No local Node, no `.env` — Compose injects the config.

```bash
# 1. Start Postgres + the Express backend + the Next.js app (first build ~2–4 min)
docker compose up -d --build

# 2. Create the database schema (run against the backend — it owns the DB connection)
docker compose exec backend npx prisma migrate deploy

# 3. Load sample organizers, users, and 50 events
docker compose exec backend npx prisma db seed
```

Then open **http://localhost:3000**.

> Compose starts Postgres, the backend, and the app, but does **not** auto‑run
> migrations — steps 2 and 3 build and seed the database. They're idempotent (the
> seed uses upserts), so re‑running them is safe. Migrate/seed run on the
> **`backend`** service because that's the only one with database credentials.

**Verify it's up:**

```bash
curl "http://localhost:3000/api/events?page=1"   # → JSON list of events, totalPages: 3
```

To stop: `docker compose down` (add `-v` to also wipe the database volume).

---

## Demo accounts

All seeded accounts use the password **`password123`**.

| Email | Role | Can do |
| --- | --- | --- |
| `alice@organizer.com` | organizer | create/edit events, view attendees & analytics, + everything a user can |
| `bob@organizer.com` | organizer | same, owns a different set of events |
| `charlie@user.com` | user | browse, search, book, view & cancel bookings |

You can also **sign up** a fresh account at `/signup` (choose user or organizer).

### See the guarantees in 60 seconds
- **Sold‑out handling:** the seeded event *"Sold Out Show — Test Event"*
  (capacity 1, already booked) shows **Sold Out** and refuses bookings.
- **Concurrency:** *"AI & GenAI Summit 2025"* has capacity **2** — a good target
  to fire concurrent `POST /api/events/:id/book` requests at and watch exactly
  the right number succeed (the rest get a clean `409`). See
  [NOTES.md §2](NOTES.md).
- **Analytics:** sign in as `alice@organizer.com`, open an event from the
  organizer dashboard → **Analytics** to see views / bookings / conversion,
  all computed from the append‑only activity log.

---

## Alternative: run locally (app + backend on host, Postgres in Docker)

Faster iteration with hot reload. Needs **Node 20+** and Docker (for Postgres
only).

```bash
# 1. Create the env file (it is git-ignored, so it isn't in the clone)
cat > .env <<'EOF'
DATABASE_URL="postgresql://bookit_user:bookit_pass@localhost:5433/bookit_db?schema=public"
NEXTAUTH_SECRET="supersecretkey_changethis_inprod"
NEXTAUTH_URL="http://localhost:3000"
# Where the Next.js proxy reaches the Express backend (default if unset):
BACKEND_URL="http://localhost:4000"
EOF

# 2. Start just the database (host port 5433 → container 5432)
docker compose up -d db

# 3. Install, migrate, seed
npm install
npx prisma migrate deploy
npx prisma db seed

# 4. Run BOTH servers (two terminals — or background the first):
npm run server   # Express backend on :4000  (the only thing that touches the DB)
npm run dev      # Next.js app on :3000       (proxies /api/* to the backend)
```

App: **http://localhost:3000**.

> The backend reads its signing secret from `AUTH_SECRET` **or** `NEXTAUTH_SECRET`,
> so the single `NEXTAUTH_SECRET` above is shared by both servers — they must
> agree, since the app signs the JWT the backend verifies. If the app is up but
> every API call returns `502`, the backend isn't running (`npm run server`).

> **Why host port 5433?** The Postgres container publishes on `5433` to avoid
> clashing with any native Postgres already on the host's `5432` (a silent clash
> there causes Prisma `P1010 "user denied access"`). The app inside Docker still
> talks to Postgres on the internal `5432`.

---

## Command reference

| Task | Docker | Local |
| --- | --- | --- |
| **Apply migrations** (build schema) | `docker compose exec backend npx prisma migrate deploy` | `npx prisma migrate deploy` |
| **Seed** sample data | `docker compose exec backend npx prisma db seed` | `npx prisma db seed` |
| **Start the backend** (Express API) | part of `docker compose up` | `npm run server` (`:4000`) |
| **Start the app** (Next.js) | part of `docker compose up` | `npm run dev` (`:3000`) |
| Create a *new* migration after editing the schema | `npx prisma migrate dev --name <change>` | same |
| Inspect data (Prisma Studio) | — | `npx prisma studio` |
| Reset DB from scratch (drop + migrate + seed) | `docker compose down -v && docker compose up -d --build` then migrate + seed | `npx prisma migrate reset` |

A **single command builds the entire schema from a fresh database**
(`prisma migrate deploy`), and the seed inserts sample organizers, users, events,
and bookings — no manual SQL required.

---

## Ports & configuration

| What | Where |
| --- | --- |
| App (Next.js — public edge) | `http://localhost:3000` |
| Express backend | `http://localhost:4000` (local). In Docker it's internal-only: `backend:4000`, not published to the host. |
| Postgres (from host) | `localhost:5433` |
| Postgres (from backend container) | `db:5432` |

Environment variables (set by `docker-compose.yml` for the Docker path, or by
your `.env` for the local path):

- `DATABASE_URL` — Postgres connection string. **Backend only.**
- `NEXTAUTH_SECRET` / `AUTH_SECRET` — signs the session JWT *and* the short-lived
  token the proxy forwards to the backend. **Must be the same value on both the
  app and the backend.** Change it in production.
- `NEXTAUTH_URL` — base URL of the app (`http://localhost:3000` for local).
- `BACKEND_URL` — where the Next.js proxy reaches the Express backend (defaults
  to `http://localhost:4000`). **App only.**
- `PORT` — backend listen port (defaults to `4000`). **Backend only.**

---

## Troubleshooting

- **`port 3000 ... address already in use`** — something else (often a stray
  `npm run dev`) holds the port. Stop it, or change the app's published port in
  `docker-compose.yml`.
- **`port 5433 already in use`** — another Postgres/container is on 5433. Stop it,
  or remap the `db` port in `docker-compose.yml` (and `DATABASE_URL` if running
  locally).
- **App loads but every page errors / empty data** — you skipped the migrate +
  seed steps. Run them (Quick start steps 2–3).
- **`docker compose exec app ...` says the container isn't running** — the app
  container failed to start (usually the port‑3000 clash above). Either free the
  port and `docker compose up -d`, or run the command as a one‑off instead:
  `docker compose run --rm app npx prisma migrate deploy`.
- **Prisma `P1010` / "user denied access" (local path)** — a native Postgres on
  `5432` is intercepting the connection. The compose DB is on `5433`; make sure
  your `.env` `DATABASE_URL` points there.
- **App is up but every API call returns `502` / login always fails** — the
  Express backend isn't reachable. Locally, start it with `npm run server`. In
  Docker, check `docker compose logs backend` (it must report healthy before
  `app` starts). Also confirm the app's `NEXTAUTH_SECRET` matches the backend's
  `AUTH_SECRET` — a mismatch makes the backend reject the proxied token.

---

## Project layout

```
src/                             FRONTEND + EDGE (Next.js) — no database access
  app/
    api/                         proxy API: every route forwards to the backend
      auth/signup/               proxy → backend signup
      auth/[...nextauth]/        Auth.js (login/logout/session) — stays in Next
      events/                    browse, detail, and …/book — all proxy to the backend
      bookings/[id]/ · me/bookings/ · organizer/events/   proxy → backend
    events/ · me/ · organizer/   pages (App Router) — fetch only /api/*
    login/ · signup/
  lib/
    auth.ts                      Auth.js config; authorize() delegates to the backend
    backend.ts                   the proxy: mints a backend JWT from the session, forwards, mirrors
  proxy.ts                       edge route gate (Next.js 16 renamed middleware → proxy)

server/                          BACKEND (Express) — the only thing that touches the DB
  src/
    index.ts · app.ts            bootstrap + routers + route protection
    db.ts                        Prisma client (pg driver adapter)
    lib/                         auth (JWT), middleware (attachUser/requireAuth), organizer-guard
    routes/                      auth, events (incl. the FOR UPDATE booking txn), bookings, me, organizer
  README.md                      backend-specific setup & API notes

prisma/
  schema.prisma                  4 models: User, Event, Booking, ActivityLog
  migrations/                    versioned SQL — one command rebuilds the schema
  seed.ts                        sample data (idempotent upserts)
docker-compose.yml               Postgres + backend + app
```

See **[NOTES.md](NOTES.md)** for the engineering rationale: the no‑oversell
guarantee, schema decisions, indexing strategy, trade‑offs, and AI usage.
