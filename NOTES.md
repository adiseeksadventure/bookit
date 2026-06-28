# BookIt — Engineering Notes

A briefing on the decisions behind this codebase: how the no‑oversell guarantee
works, why the schema looks the way it does, what the indexes are for, and where
AI helped (and where I overrode it).

---

## 1. Stack & shape

| Concern | Choice | Why |
| --- | --- | --- |
| Frontend + edge | **Next.js 16** (App Router) | Serves the UI **and** a thin JSON API that *proxies* to the backend. Holds **no database credentials** — it manages Auth.js sessions and forwards requests (see §1.1). |
| Backend / API | **Express 5** (`server/`) | The headless API that owns all business logic and is the **only** process that touches Postgres. The browser never reaches it directly. |
| DB / ORM | **PostgreSQL 16** + **Prisma 7** (with the `@prisma/adapter-pg` driver adapter) | Postgres gives us real row‑level locking, which the concurrency guarantee leans on. Prisma gives typed queries + a first‑class migration workflow. Lives in the **Express backend** (and the seed). |
| Auth | **Auth.js (NextAuth v5)**, Credentials provider, **JWT session** | Stateless sessions (signed cookie, no session table). Auth.js manages the *session*; the password check is delegated to the backend's `bcryptjs` (cost 10) — see §1.1 and §5. |
| Middleware | `src/proxy.ts` | In Next.js 16 the `middleware` convention was renamed to **`proxy`** and runs on the Node runtime. Same job: gate protected routes before the handler runs. |

> **Heads‑up on a Next.js 16 quirk:** the route‑gating file is `src/proxy.ts`, *not*
> `src/middleware.ts`. If you go looking for the auth gate and can't find
> `middleware.ts`, that's why.

### 1.1 Decoupled by design: Next.js is the edge, Express is the backend
The brief asks for both Next/React **and** Express. Rather than duplicate the API
in both, BookIt is split along a clean production seam:

```
browser ──▶ Next.js (UI + Auth.js sessions + proxy API) ──▶ Express backend ──▶ Postgres
            src/app/**, src/app/api/**                       server/**
```

- **The frontend only ever talks to Next.js.** Every page fetches relative
  `/api/*` URLs; the browser never learns the backend exists. So in production the
  Express service can sit on a **private network**, with only the Next.js edge
  exposed publicly — the frontend stays decoupled from the backend.
- **The Next route handlers are thin proxies.** Each handler under
  `src/app/api/**` forwards to the matching Express route and mirrors its response
  — see [`src/lib/backend.ts`](src/lib/backend.ts) and e.g.
  [`src/app/api/events/[id]/book/route.ts`](src/app/api/events/[id]/book/route.ts),
  now a few lines that call `proxy(req, …)`. **No business logic and no Prisma
  remain in the Next app.**
- **Express owns everything load‑bearing.** Validation, the
  `SELECT … FOR UPDATE` booking transaction (§2), the capacity floor, analytics
  aggregation, and the *only* database connection all live in
  [`server/`](server/). One source of truth.

**How auth crosses the seam.** Auth.js still runs in Next for what it's good at —
the signed, stateless *session cookie* and the SSR `auth()` helper — but the two
DB‑touching parts are delegated to the backend:

1. **Login.** The Auth.js Credentials `authorize` callback
   ([`src/lib/auth.ts`](src/lib/auth.ts)) no longer queries the DB; it POSTs to
   the backend's `/api/auth/login`, which does the bcrypt check. Even password
   verification is decoupled.
2. **Authenticated proxying.** On each forwarded request the proxy reads the
   Auth.js session and mints a **short‑lived JWT** (60 s) signed with the shared
   `AUTH_SECRET`/`NEXTAUTH_SECRET`, sent to Express as `Authorization: Bearer`.
   Express verifies it like a token from any other client. The encrypted Auth.js
   cookie never leaves Next; the backend only ever sees a portable JWT.

That is why the backend speaks **plain JWT** (cookie *or* bearer) instead of
Auth.js's encrypted cookie: it has to serve the Next edge and any other client
(a mobile app, a CLI, another service) identically. The backend is its own npm
package — run it with `cd server && npm run dev` (`:4000`); see
[`server/README.md`](server/README.md).

API surface — the browser calls these on **Next.js** (`src/app/api/**`), which
proxies each to the **Express backend** (`server/src/routes/**`):

```
POST   /api/auth/signup                         create account (user|organizer)
GET    /api/events                              browse: search + date + page
GET    /api/events/:id                          detail (+ logs event_viewed)
POST   /api/events/:id/book                     ← the concurrency-critical endpoint
DELETE /api/bookings/:id                        cancel (frees the seat)
GET    /api/me/bookings                         my bookings
GET    /api/organizer/events                    organizer's events + sold counts
POST   /api/organizer/events                    create event
GET    /api/organizer/events/:id                single event (owner only)
PATCH  /api/organizer/events/:id                edit (capacity floor enforced)
GET    /api/organizer/events/:id/attendees      attendee list
GET    /api/organizer/events/:id/analytics      analytics from activity_log
```

Auth/session differs by tier — the frontend uses Auth.js; the backend exposes
plain‑REST equivalents that any client (including the Next proxy) can use:

```
Next (frontend)   /api/auth/[...nextauth]       login/logout/session (Auth.js, encrypted cookie)
Express (backend) POST /api/auth/login          verify credentials → signed JWT (cookie + body token)
                  POST /api/auth/logout         clear the session cookie
                  GET  /api/auth/session        current session, or { user: null }
```

---

## 2. The no‑oversell guarantee (the core of the assignment)

**The invariant:** for an event with capacity `N`, the number of `confirmed`
bookings must *never* exceed `N` — even if a thousand people hit "Book" on the
last seat in the same millisecond.

### 2.1 Why the naïve version is broken

The obvious implementation is:

```
count = SELECT count(*) FROM Booking WHERE eventId = ? AND status = 'confirmed'
if (count < capacity) INSERT booking
```

This is a textbook **time‑of‑check/time‑of‑use race**. Two requests for the last
seat both run the `SELECT`, both read `N‑1 < N`, both pass the check, and both
`INSERT`. Now there are `N+1` confirmed bookings. No amount of application‑level
care fixes this — the check and the write are not atomic with respect to other
transactions.

### 2.2 What we actually do — pessimistic row lock + transaction

The whole booking lives in a single Prisma `$transaction`
([`src/app/api/events/[id]/book/route.ts`](src/app/api/events/[id]/book/route.ts)).
The first statement inside it is:

```sql
SELECT id, capacity, date FROM "Event" WHERE id = ${eventId} FOR UPDATE
```

`FOR UPDATE` takes a **row‑level exclusive lock** on that one Event row.
Everything downstream of it is serialized:

1. **Lock the Event row.** The *second* concurrent booking transaction blocks
   right here, at the `SELECT … FOR UPDATE`, until the first transaction commits
   or rolls back. There is exactly one Event row per event, so it is the natural
   serialization point — every booking attempt for this event queues behind it.
2. **Existence + past‑date checks.** Unknown event → `404`. Event already started
   → `409`.
3. **"Already booked?"** If this user already holds a `confirmed` booking, return
   `409 ALREADY_BOOKED`. This is checked **before** capacity on purpose: a user
   who already has a seat should hear "you're already booked," not "sold out,"
   even on a full event — they aren't losing anything.
4. **Count confirmed bookings.** Safe *now*, because we hold the lock: we are
   guaranteed to see every booking committed before us. `confirmed >= capacity`
   → `409 SOLD_OUT`.
5. **Create or reactivate** the booking, then **log `booking_confirmed` inside
   the same transaction** so the analytics event commits atomically with the
   booking and can never be lost.

Walk the two‑racers‑for‑the‑last‑seat scenario through this:

- Request A acquires the lock, counts `N‑1`, inserts, commits, releases.
- Request B was blocked at step 1. It wakes up *after* A committed, so its
  count at step 4 now reads `N` → `SOLD_OUT` → clean `409`.

**Exactly one wins; the other gets a clean "sold out."** That is the requirement,
and it holds for any number of simultaneous requests — they all line up behind
the same row lock and the first one to find a free seat takes it.

### 2.3 Defense in depth (the backstops)

The row lock is the guarantee. These exist so that a bug, a double‑click, or a
raised isolation level can't quietly break the invariant:

- **`@@unique([userId, eventId])`** — a *database‑level* guarantee that one user
  can't hold two bookings for the same event. If two of a single user's own
  requests race past the app‑level "already booked?" check (classic
  double‑click), the unique index rejects the second insert. We catch Prisma
  `P2002` and return `409` instead of a `500`.
- **`P2034` (serialization failure / deadlock) → `409` retryable.** Mapped to a
  friendly "high demand right now — please try again" rather than a `500`. This
  is what makes the endpoint *also* correct if you ever raise the isolation
  level to `Serializable`, and it cleanly handles the rare deadlock under row
  locking.
- **`timeout: 10_000`** on the transaction so a stuck lock can't hang a request
  forever.
- **Typed `BookingError` with a `code`** — we branch on `err.code`, never on
  `Error.message`, so error handling can't silently drift.

### 2.4 Why `FOR UPDATE` and not `Serializable` isolation

> The assignment brief framed this as "serializable isolation." I shipped an
> explicit **`SELECT … FOR UPDATE`** row lock at the default (Read Committed)
> isolation instead, and kept the `P2034` handler so the code stays correct if
> isolation *is* raised. Here's the reasoning — this is the trade‑off I'd expect
> to defend.

- **Serializable** is the textbook answer and is correct, but under contention
  Postgres resolves conflicts by *aborting* the losing transactions with a
  serialization failure. That forces a **client‑side retry loop**, and on a hot
  event (the last seat of a popular show) you get retry storms — every loser
  re‑runs the whole transaction, conflicts again, and retries again.
- **`FOR UPDATE`** turns the same contention into a **deterministic queue**:
  losers *block* instead of *abort*, wake up one at a time, see the updated
  count, and get a single clean `SOLD_OUT`. No client retry loop, one winner per
  round, predictable latency. For single‑row contention (one Event row) this is
  the simpler and more robust mechanism.
- I considered two other options and rejected them:
  - **Denormalized `seatsRemaining` counter with an atomic
    `UPDATE … SET seats = seats - 1 WHERE seats > 0`.** Fast, but it creates a
    *second source of truth* that can drift from the bookings table and makes
    cancel/re‑book bookkeeping fragile. I chose a single source of truth (see
    §3.3).
  - **A `CHECK` constraint / trigger enforcing the count.** Pushes the business
    rule down into SQL where it's harder to read and test. The explicit lock
    keeps the rule in one readable place in application code.

### 2.5 Cancellation is its own little race

Cancelling ([`src/app/api/bookings/[id]/route.ts`](src/app/api/bookings/[id]/route.ts))
is a single **atomic conditional update**:

```
UPDATE Booking SET status = 'cancelled'
WHERE id = ? AND userId = ? AND status = 'confirmed'
```

If two cancel requests race, only one flips the row (`count === 1`); the other
sees `count === 0` and gets `409 "already cancelled."` **The seat is freed
automatically** — seats are always *derived* from the confirmed count (§3.3), so
dropping a booking out of `confirmed` instantly returns it to inventory with no
counter to update.

---

## 3. Schema decisions

Four tables — [`prisma/schema.prisma`](prisma/schema.prisma). Migration:
[`prisma/migrations/20260627080628_init/migration.sql`](prisma/migrations/20260627080628_init/migration.sql).

```
User (id, email⊕, passwordHash, name, role, createdAt)
Event (id, title, description, venue, date, capacity, price, organizerId→User, createdAt)
Booking (id, userId→User, eventId→Event, status, createdAt)   ⊕(userId,eventId)
ActivityLog (id, eventId→Event, userId?→User, type, createdAt)
```

### 3.1 Single `User` table with a `role` flag
Per the brief. `role` is `"user" | "organizer"` (string, defaults to `"user"`).
An organizer is a superset of a user, so one table + one flag is simpler than
separate tables and lets the same account browse and book. The signup route
coerces anything that isn't `"organizer"` to `"user"` so the role can't be set to
an arbitrary value.

### 3.2 `cuid` primary keys (not auto‑increment)
IDs are generated app‑side as `cuid`s. Versus serial integers: they don't leak
volume ("how many users/bookings exist?"), aren't guessable/enumerable in URLs,
and don't need a DB round‑trip to obtain. The seed uses *deterministic* ids
(`event-1`, `booking-1`, …) so re‑seeding is idempotent via `upsert`.

### 3.3 Bookings carry a `status`; seats are **derived**, never stored
A booking is `confirmed` or `cancelled` — we **soft‑cancel**, we don't delete.
This buys three things:

- **History is preserved** for analytics (a cancellation is a real event we want
  to count).
- **Re‑booking is clean:** if a user cancels and re‑books, we *reactivate* the
  existing row (`status → confirmed`) instead of inserting a duplicate, which
  keeps the `@@unique([userId, eventId])` constraint valid.
- **Seats remaining = `capacity − count(confirmed bookings)`**, computed on read
  everywhere (listing, detail, organizer dashboard). There is **no
  `seatsRemaining` column.** A stored counter would be a second source of truth
  that can drift; deriving it means the bookings table is the *only* truth and
  the count is always correct by construction. The `Booking_eventId_status_idx`
  index (§4) makes that count cheap.

### 3.4 `ActivityLog` is append‑only and analytics are computed from it
Every meaningful action writes one immutable row: `event_viewed`,
`booking_started`, `booking_confirmed`, `booking_cancelled`. Analytics
([`/api/organizer/events/:id/analytics`](src/app/api/organizer/events/[id]/analytics/route.ts))
are a `GROUP BY type` over this table at read time — **we never store aggregate
counters.** Same philosophy as seats: the log is the source of truth, the numbers
are always consistent with it, and we can derive new metrics later without a
migration.

- `userId` is **nullable** so anonymous (logged‑out) users still generate
  `event_viewed` rows — view counts shouldn't require a login.
- Its FK is **`ON DELETE SET NULL`** (the only relation that isn't `RESTRICT`):
  deleting a user must not destroy the historical log; the row survives with a
  null actor.
- `booking_started` is logged **outside** the booking transaction, best‑effort
  (errors swallowed). Two reasons: (a) analytics must never block or fail a real
  booking, and (b) we deliberately want to record the *attempt* even when it ends
  in `SOLD_OUT` — that's exactly what makes the **view → booking conversion rate**
  meaningful. `booking_confirmed`, by contrast, is logged *inside* the
  transaction so it can't be lost or double‑counted.

### 3.5 Foreign‑key delete behavior
`Event→User`, `Booking→User`, `Booking→Event` are all **`ON DELETE RESTRICT`**:
you can't delete a user who organizes events or holds bookings, or an event that
has bookings, without dealing with the children first. That prevents orphaned
rows and silent data loss. Only `ActivityLog→User` is `SET NULL` (§3.4).

### 3.6 Known schema trade‑offs (honest list)
- **`price` is a `Float`/`DOUBLE PRECISION`.** Fine for a demo, but floating
  point is the wrong type for money. For real currency I'd use `Decimal`
  (Postgres `NUMERIC`) to avoid rounding error. Called out deliberately.
- **`status` / `role` / activity `type` are bare strings**, enforced by
  convention and the application, not a DB `enum`. Easy to evolve; the cost is
  the DB won't reject a typo'd status on its own. A Postgres `enum` (or a `CHECK`)
  would tighten this.

---

## 4. Indexing decisions

The brief requires the listing to scale past 100k events with **indexed SQL
pagination — no loading everything into memory, no filtering in JS.** Every index
below maps to a real query.

| Index | Serves |
| --- | --- |
| `Event_date_idx` on `Event(date)` | The listing's default filter (`date >= now`), the single‑day range filter, **and** `ORDER BY date ASC`. One index covers the filter and the sort — this is the workhorse for pagination. |
| `Event_title_idx` on `Event(title)` | Title search / lookups. **Caveat below.** |
| `Event_organizerId_idx` on `Event(organizerId)` | "My events" on the organizer dashboard (`WHERE organizerId = ?`). |
| `Booking_eventId_status_idx` on `Booking(eventId, status)` | The hot path: `count(confirmed) WHERE eventId = ? AND status = 'confirmed'` — used in the booking transaction, the listing's seats‑remaining, the detail page, and attendee lists. Composite so the count is index‑served. |
| `Booking_userId_idx` on `Booking(userId)` | "My bookings." |
| `@@unique([userId, eventId])` (also an index) | Enforces one‑booking‑per‑user‑per‑event *and* makes the per‑user lookup in the booking flow a single index probe. |
| `ActivityLog_eventId_type_idx` on `ActivityLog(eventId, type)` | The analytics `GROUP BY type WHERE eventId = ?` aggregation. |
| `User_email_key` (unique) + `User_email_idx` | Login looks users up by email on every sign‑in. |

**How pagination actually runs:** the backend's [`/api/events`](server/src/routes/events.ts)
issues two queries in parallel — `findMany({ where, skip, take: 20, orderBy: date })`
and `count({ where })` — so we return rows *and* `totalPages` without ever
materializing the full table. `skip/take` is offset pagination backed by the
date index.

**Two honest limitations at true 100k+ scale** (the kind of thing I'd flag in
review, not hide):

1. **Substring title search uses `contains` (`ILIKE '%term%'`).** A leading
   wildcard can't use a B‑tree, so `Event_title_idx` helps prefix/equality and
   ordering but *not* arbitrary `%term%` search — that degrades to a scan over
   the date‑filtered set. The production fix is a **trigram GIN index**
   (`pg_trgm`) or Postgres full‑text search. I left it as B‑tree + `contains`
   to keep the migration dependency‑free; the upgrade path is a one‑line
   extension + index.
2. **Deep offset pagination** (`OFFSET 100000`) makes Postgres walk and discard
   all skipped rows. For very deep paging I'd switch to **keyset/cursor**
   pagination on `(date, id)`. Offset is the right call for a demo with a
   bounded page count and is honestly fine for the first few thousand pages.

---

## 5. Auth & route protection

Auth is enforced in **two tiers** that mirror the frontend/backend split (§1.1):
the Next edge gates and proxies, and the Express backend independently verifies.

- **Sessions are JWTs** (`session.strategy: "jwt"`), so there's no session table
  to hit on every request. The `jwt` callback copies `id` and `role` onto the
  token at sign‑in; the `session` callback exposes them on `session.user`. The
  credential check itself is delegated to the backend (§1.1).
- **`src/proxy.ts`** is the front gate at the edge. It 401s API calls and
  redirects page requests to `/login` for anything under `/me`, `/organizer`,
  `/api/me`, `/api/organizer`, `/api/bookings`, and `POST /api/events`. Browsing
  events (`GET`) stays public. The matcher deliberately **excludes `/api/auth/*`**
  so we don't re‑run the auth middleware over Auth.js's own endpoints.
- **The proxy forwards identity, not the cookie.** For an authenticated call the
  Next proxy mints a short‑lived bearer JWT from the session and sends it to
  Express ([`src/lib/backend.ts`](src/lib/backend.ts)). So `proxy.ts` is a fast
  first line, but the **backend is the real authority** — its `attachUser` /
  `requireAuth` ([`server/src/lib/middleware.ts`](server/src/lib/middleware.ts))
  return a clean `401` even if a request reaches it without a valid token.
- **`requireOrganizer`** ([`server/src/lib/organizer-guard.ts`](server/src/lib/organizer-guard.ts))
  is the backend's shared guard for organizer routes: `401` if not signed in,
  `403` if the role isn't `organizer`. Every organizer handler *also* re‑checks
  `event.organizerId === userId` so one organizer can't read or edit another's
  event — role and ownership are separate concerns.
- **Edit capacity floor:** the backend's `PATCH /api/organizer/events/:id` refuses
  to set capacity below the current confirmed‑booking count (`400` with the exact
  number), so editing can never retroactively oversell an event.

---

## 6. What I'd do next (with more time)

- Trigram/full‑text search and keyset pagination (§4) for genuine 100k‑scale.
- `Decimal` for `price`; Postgres `enum`s or `CHECK`s for the status/role/type
  strings.
- The natural live‑interview extension — a **waitlist**: when `SOLD_OUT`, append
  a `waitlisted` booking; on cancel, promote the head of the waitlist inside the
  same locked transaction that frees the seat. The current design supports this
  cleanly because the lock + derived‑seats model already centralizes the
  "a seat changed hands" moment.
- Automated concurrency tests (fire N parallel `book` requests at a 1‑seat event,
  assert exactly one `201` and `N‑1` `409`s).
- Rate limiting on signup/login.

---

## 7. AI tooling — and where I disagreed with it

**Tools used.** I used **Claude (Claude Code)** as a pair‑programmer for
scaffolding route handlers, wiring up Auth.js v5 (which is beta and shifts
between releases), generating the seed data, and drafting these docs. It was
genuinely useful for boilerplate and for surfacing the Next.js 16
`middleware → proxy` rename I'd otherwise have tripped over.

**Where I overrode it** (the decisions I want to own in the interview):

- **Concurrency mechanism.** The first suggestion was `Serializable` isolation
  with a retry loop. I switched to an explicit **`SELECT … FOR UPDATE`** row lock
  because it turns contention into a deterministic queue with one clean winner
  instead of an abort/retry storm on hot events (§2.4). I kept the `P2034`
  handler so the code is *also* safe under serializable — belt and suspenders,
  not either/or.
- **No denormalized seat counter.** AI leaned toward an `Event.seatsRemaining`
  column decremented on booking for speed. I rejected it: a second source of
  truth drifts and makes cancel/re‑book fragile. **Derived counts + the
  composite booking index** keep one source of truth and are fast enough (§3.3).
- **Where the analytics writes live.** I deliberately moved `booking_started`
  *outside* the transaction (best‑effort) and kept `booking_confirmed` *inside*
  it — so analytics can never block or fail a real booking, yet we still capture
  failed attempts for the conversion metric (§3.4). The naive version logged
  everything inline, which would let a logging hiccup roll back a real booking.
- **"Already booked" ordering.** I put the already‑booked check *before* the
  capacity check so an existing attendee gets the accurate message on a full
  event rather than a misleading "sold out" (§2.2).

The throughline: AI wrote a lot of the *typing*, but the load‑bearing
decisions — locking strategy, single source of truth, transaction boundaries —
are deliberate and are mine to defend.
