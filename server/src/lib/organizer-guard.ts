import type { RequestHandler } from "express";

// Shared guard for every organizer-only route: 401 if not signed in, 403 if the
// signed-in user isn't an organizer. The per-handler ownership check
// (`event.organizerId === req.user.id`) stays in each handler — the role check
// and the ownership check are separate concerns (NOTES §5). This is the Express
// port of `src/lib/organizer-guard.ts`'s `requireOrganizer()`.
export const requireOrganizer: RequestHandler = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.user.role !== "organizer") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
};
