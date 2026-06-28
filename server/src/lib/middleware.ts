import type { NextFunction, Request, RequestHandler, Response } from "express";
import { SESSION_COOKIE, verifySession, type SessionUser } from "./auth";

// Augment Express's Request with the authenticated user (undefined when none).
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

// Populate `req.user` from a valid session, via the `Authorization: Bearer`
// header (for non-browser clients) or the session cookie (for browsers). NEVER
// rejects — public routes still work; protected routes layer `requireAuth` /
// `requireOrganizer` on top. This mirrors how the Next app could always call
// `auth()` and let each handler decide what to do with the result.
export const attachUser: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  const bearer =
    header && header.startsWith("Bearer ") ? header.slice(7) : undefined;
  const token = bearer ?? req.cookies?.[SESSION_COOKIE];
  if (token) {
    const user = verifySession(token);
    if (user) req.user = user;
  }
  next();
};

// Gate for any signed-in user — the Express equivalent of `proxy.ts` answering
// API calls with a clean 401 instead of an HTML login redirect.
export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

// Wrap async handlers so a rejected promise reaches the error middleware instead
// of hanging the request.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch(next);
}
