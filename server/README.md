# BookIt — Express backend

The **Express 5** backend that owns all business logic and is the **only**
process that touches Postgres. The Next.js app is a thin edge that proxies every
`/api/*` call here (see [NOTES §1.1](../NOTES.md)), so in production this service
can live on a private network with only Next.js exposed publicly.

Because it speaks plain JWT (cookie *or* `Authorization: Bearer`), it also works
directly from any non‑Next client — a mobile app, a CLI, another service — not
just the Next proxy.

## Run it

This is a **self-contained npm package** — its own `package.json`,
`node_modules`, `tsconfig`, and `.env`. Run everything from `server/`:

```bash
cd server
cp .env.example .env         # DATABASE_URL, AUTH_SECRET, PORT
npm install                  # installs deps + generates the Prisma client (postinstall)
npm run migrate              # apply migrations (prisma migrate deploy)
npm run seed                 # load sample data
npm run dev                  # watch mode (tsx) on http://localhost:4000
# production: npm run build && npm start   (tsc → node dist/index.js)
```

Config (read from `server/.env`):

| Var | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string — this service is the only DB client. |
| `AUTH_SECRET` / `NEXTAUTH_SECRET` | yes | Secret for signing/verifying session JWTs. **Must equal the frontend's `NEXTAUTH_SECRET`.** |
| `PORT` | no | Listen port (default `4000`). |
| `CORS_ORIGIN` | no | Comma‑separated allowed origins. Omit to reflect any origin (dev). |

Scripts: `npm run dev` (watch) · `npm run build` (tsc → `dist/`) · `npm start`
(run compiled) · `npm run typecheck` · `npm run migrate` · `npm run seed`.

## Auth (the one difference from the Next app)

The Next app uses Auth.js's encrypted session cookie, which only its own runtime
can read. This service issues a **portable plain JWT** signed with the same
secret, so any client can use it. Send it back as either:

- the httpOnly `session` cookie (set automatically on login — for browsers), or
- an `Authorization: Bearer <token>` header (the token is also returned in the
  login response body — for API clients).

```bash
BASE=http://localhost:4000

# log in → grab the token from the response
curl -s -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"charlie@user.com","password":"password123"}'

# authenticated request with the token
curl -s $BASE/api/me/bookings -H "Authorization: Bearer <token>"

# book the last seat (the concurrency-safe endpoint)
curl -s -X POST $BASE/api/events/<eventId>/book -H "Authorization: Bearer <token>"
```

## Endpoints

Identical to the Next app, except for auth/session. Full list in
[NOTES §1.1](../NOTES.md). Auth/session endpoints here:

```
POST /api/auth/signup     create account (user|organizer)
POST /api/auth/login      verify credentials → signed JWT (cookie + body token)
POST /api/auth/logout     clear the session cookie
GET  /api/auth/session    current session, or { user: null }
GET  /api/health          liveness probe
```

## Layout

```
server/
  package.json            backend deps + scripts (its own node_modules)
  tsconfig.json           tsc build → dist/ (CommonJS)
  Dockerfile              build image: tsc → node dist/index.js
  prisma.config.ts        schema path + seed command
  prisma/
    schema.prisma         User, Event, Booking, ActivityLog
    migrations/           versioned SQL
    seed.ts               sample data (idempotent upserts)
  src/
    index.ts              bootstrap: load .env, listen
    app.ts                build the app, mount routers, route protection (mirrors proxy.ts)
    db.ts                 Prisma client (pg driver adapter)
    lib/
      auth.ts             JWT sign/verify + session cookie options
      middleware.ts       attachUser (optional), requireAuth, asyncHandler
      organizer-guard.ts  requireOrganizer (401/403)
    routes/
      auth.ts             signup, login, logout, session
      events.ts           list, detail (+event_viewed), book (FOR UPDATE txn)
      bookings.ts         cancel
      me.ts               my bookings
      organizer.ts        events CRUD, attendees, analytics
```
