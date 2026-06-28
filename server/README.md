# BookIt — Express backend

The **Express 5** backend that owns all business logic and is the **only**
process that touches Postgres. The Next.js app is a thin edge that proxies every
`/api/*` call here (see [NOTES §1.1](../NOTES.md)), so in production this service
can live on a private network with only Next.js exposed publicly.

Because it speaks plain JWT (cookie *or* `Authorization: Bearer`), it also works
directly from any non‑Next client — a mobile app, a CLI, another service — not
just the Next proxy.

## Run it

From the repo root (it reuses the root `node_modules`, `.env`, and Prisma client):

```bash
npm install                 # if you haven't already
npx prisma generate         # if the client isn't generated yet
npm run server              # start on http://localhost:4000
# or: npm run server:dev    # watch mode (tsx watch)
```

Config (read from the root `.env`, same file the Next app uses):

| Var | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection (same DB as the Next app). |
| `AUTH_SECRET` / `NEXTAUTH_SECRET` | yes | Secret used to sign session JWTs (reuses the Next app's). |
| `PORT` | no | Listen port (default `4000`). |
| `CORS_ORIGIN` | no | Comma‑separated allowed origins. Omit to reflect any origin (dev). |

Typecheck only: `npm run server:typecheck`.

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
  src/
    index.ts              bootstrap: load .env, listen
    app.ts                build the app, mount routers, route protection (mirrors proxy.ts)
    db.ts                 Prisma client (mirrors src/lib/db.ts)
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
