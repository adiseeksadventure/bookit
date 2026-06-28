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
# 1. Build & start Postgres + the Express backend + the Next.js frontend
#    (first build ~2–4 min). The backend applies pending migrations on startup.
docker compose up -d --build

# 2. Load sample organizers, users, and 50 events (one-off; idempotent upserts)
docker compose exec backend npm run seed
```

Then open **http://localhost:3000**.

> The **`backend`** service runs `prisma migrate deploy` automatically when it
> boots (it's the only service with database credentials), so the schema is built
> for you. Seeding stays a manual one‑off — step 2. The seed uses upserts, so
> re‑running it is safe.

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

## Alternative: run locally (frontend + backend on host, Postgres in Docker)

Faster iteration with hot reload. The frontend and backend are **two independent
npm packages** (separate `package.json`, separate `node_modules`), so you install
and run each on its own. Needs **Node 20+** and Docker (for Postgres only).

```bash
# 1. Create the two env files (git-ignored — copy from the checked-in examples)
cp .env.example .env                 # frontend: NEXTAUTH_SECRET, NEXTAUTH_URL, BACKEND_URL
cp server/.env.example server/.env   # backend:  DATABASE_URL, AUTH_SECRET, PORT

# 2. Start just the database (host port 5433 → container 5432)
docker compose up -d db

# 3. Install + prepare the BACKEND (owns Prisma + the DB)
cd server
npm install                  # also generates the Prisma client (postinstall)
npm run migrate              # apply migrations  (prisma migrate deploy)
npm run seed                 # load sample data
npm run dev                  # Express backend on :4000  ── leave running

# 4. In another terminal, install + run the FRONTEND
cd ..        # repo root
npm install                  # frontend deps only — no Prisma, no Express
npm run dev                  # Next.js frontend on :3000 (proxies /api/* to :4000)
```

App: **http://localhost:3000**.

> `NEXTAUTH_SECRET` (frontend `.env`) and `AUTH_SECRET` (`server/.env`) **must be
> the same value** — the frontend signs the JWT the backend verifies. If the app
> is up but every API call returns `502`, the backend isn't running
> (`cd server && npm run dev`).

> **Why host port 5433?** The Postgres container publishes on `5433` to avoid
> clashing with any native Postgres already on the host's `5432` (a silent clash
> there causes Prisma `P1010 "user denied access"`). The app inside Docker still
> talks to Postgres on the internal `5432`.

---

## Command reference

All local Prisma/backend commands run **from `server/`** (the package that owns
the database).

| Task | Docker | Local (from `server/`) |
| --- | --- | --- |
| **Apply migrations** (build schema) | automatic on `backend` startup | `npm run migrate` |
| **Seed** sample data | `docker compose exec backend npm run seed` | `npm run seed` |
| **Start the backend** (Express API) | part of `docker compose up` | `npm run dev` (`:4000`) |
| **Start the frontend** (Next.js) | part of `docker compose up` | `npm run dev` from repo root (`:3000`) |
| Create a *new* migration after editing the schema | `docker compose exec backend npx prisma migrate dev --name <change>` | `npx prisma migrate dev --name <change>` |
| Inspect data (Prisma Studio) | — | `npx prisma studio` |
| Reset DB from scratch (drop + migrate + seed) | `docker compose down -v && docker compose up -d --build` then seed | `npx prisma migrate reset` |

A **single command builds the entire schema from a fresh database**
(`prisma migrate deploy`, run for you on backend startup), and the seed inserts
sample organizers, users, events, and bookings — no manual SQL required.

---

## Ports & configuration

| What | Where |
| --- | --- |
| App (Next.js — public edge) | `http://localhost:3000` |
| Express backend | `http://localhost:4000` (local). In Docker it's internal-only: `backend:4000`, not published to the host. |
| Postgres (from host) | `localhost:5433` |
| Postgres (from backend container) | `db:5432` |

Environment variables (set by `docker-compose.yml` for the Docker path, or split
across `.env` (frontend) and `server/.env` (backend) for the local path):

- `DATABASE_URL` — Postgres connection string. **Backend only** (`server/.env`).
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
- **App loads but every page errors / empty data** — the database wasn't seeded.
  Run `docker compose exec backend npm run seed` (or `cd server && npm run seed`).
- **Prisma `P1010` / "user denied access" (local path)** — a native Postgres on
  `5432` is intercepting the connection. The compose DB is on `5433`; make sure
  `server/.env`'s `DATABASE_URL` points there.
- **App is up but every API call returns `502` / login always fails** — the
  Express backend isn't reachable. Locally, start it with `cd server && npm run
  dev`. In Docker, check `docker compose logs backend` (it must report healthy
  before `frontend` starts). Also confirm the frontend's `NEXTAUTH_SECRET`
  matches the backend's `AUTH_SECRET` — a mismatch makes the backend reject the
  proxied token.

---

## Project layout

Two **independent npm packages** — each with its own `package.json`,
`node_modules`, `tsconfig`, scripts, `.env`, and `Dockerfile`. They share nothing
but the wire protocol (HTTP + a JWT signed with the same secret).

```
package.json                     FRONTEND package — next/next-auth/react/jsonwebtoken only
Dockerfile  .dockerignore        Next.js standalone image (no Prisma, no Express)
next.config.ts                   output: "standalone"
.env(.example)                   NEXTAUTH_SECRET, NEXTAUTH_URL, BACKEND_URL — no DB creds
src/                             FRONTEND + EDGE (Next.js) — no database access
  app/
    api/                         proxy API: every route forwards to the backend
      auth/signup/               proxy → backend signup
      auth/[...nextauth]/        Auth.js (login/logout/session) — stays in Next
      events/                    browse, detail, and …/book — all proxy to the backend
      bookings/[id]/ · me/bookings/ · organizer/events/   proxy → backend
    events/ · me/ · organizer/   pages (App Router) — fetch only /api/*, surface errors gracefully
    login/ · signup/
  lib/
    auth.ts                      Auth.js config; authorize() delegates to the backend
    backend.ts                   the proxy: mints a backend JWT from the session, forwards, mirrors
  proxy.ts                       edge route gate (Next.js 16 renamed middleware → proxy)

server/                          BACKEND package (Express) — the only thing that touches the DB
  package.json                   express/cors/prisma/bcrypt + its own scripts & node_modules
  Dockerfile  .dockerignore      backend image (tsc build → node dist/index.js)
  .env(.example)                 DATABASE_URL, AUTH_SECRET, PORT
  src/
    index.ts · app.ts            bootstrap + routers + route protection
    db.ts                        Prisma client (pg driver adapter)
    lib/                         auth (JWT), middleware (attachUser/requireAuth), organizer-guard
    routes/                      auth, events (incl. the FOR UPDATE booking txn), bookings, me, organizer
  prisma/
    schema.prisma                4 models: User, Event, Booking, ActivityLog
    migrations/                  versioned SQL — one command rebuilds the schema
    seed.ts                      sample data (idempotent upserts)
  README.md                      backend-specific setup & API notes

docker-compose.yml               db + backend + frontend (each built from its own context)
```

See **[NOTES.md](NOTES.md)** for the engineering rationale: the no‑oversell
guarantee, schema decisions, indexing strategy, trade‑offs, and AI usage.
