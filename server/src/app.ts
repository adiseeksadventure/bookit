import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { attachUser, requireAuth } from "./lib/middleware";
import { requireOrganizer } from "./lib/organizer-guard";
import { authRouter } from "./routes/auth";
import { eventsRouter } from "./routes/events";
import { bookingsRouter } from "./routes/bookings";
import { meRouter } from "./routes/me";
import { organizerRouter } from "./routes/organizer";

// Build the Express app. The route protection here mirrors `src/proxy.ts`: the
// `/me`, `/organizer`, and `/bookings` API groups require a signed-in user (and
// organizer routes additionally require the organizer role), while browsing
// events stays public. The one POST under events that must be protected —
// `POST /api/events/:id/book` — carries its own `requireAuth` inside the events
// router, matching proxy.ts's "protect POST /api/events" rule.
export function createApp() {
  const app = express();

  // CORS first so preflight requests get headers without going through the body
  // parser. `credentials: true` lets browser clients send the session cookie;
  // set CORS_ORIGIN (comma-separated) to lock down allowed origins in prod.
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN?.split(",") ?? true,
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(cookieParser());

  // Always resolve the caller (Bearer token or session cookie) — never rejects.
  app.use(attachUser);

  // Liveness probe.
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Public + auth endpoints.
  app.use("/api/auth", authRouter);
  app.use("/api/events", eventsRouter);

  // Protected endpoints (proxy.ts parity).
  app.use("/api/me", requireAuth, meRouter);
  app.use("/api/bookings", requireAuth, bookingsRouter);
  app.use("/api/organizer", requireOrganizer, organizerRouter);

  // Unknown routes → JSON 404 (API clients expect JSON, never HTML).
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Central error handler — anything thrown in a handler lands here as a 500.
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  );

  return app;
}
