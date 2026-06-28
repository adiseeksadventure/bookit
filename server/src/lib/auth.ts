// Auth for the standalone Express service.
//
// The Next app used Auth.js (NextAuth v5) with a JWT *session strategy* — a
// stateless, signed session cookie, no session table. Auth.js encrypts that
// cookie (JWE), which only its own runtime can read. A standalone service for
// non-Next clients can't (and shouldn't) reuse that encrypted cookie, so we keep
// the *same idea* — a stateless signed token — with a plain, portable JWT signed
// with the same secret. See NOTES §1 and §5.
import jwt from "jsonwebtoken";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

// httpOnly cookie that carries the session for browser clients.
export const SESSION_COOKIE = "session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

// Reuse the same secret as the Next app so configuration stays in one place.
function secret(): string {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) {
    throw new Error(
      "AUTH_SECRET (or NEXTAUTH_SECRET) must be set to sign session tokens"
    );
  }
  return s;
}

export function signSession(user: SessionUser): string {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    secret(),
    { expiresIn: MAX_AGE_SECONDS }
  );
}

export function verifySession(token: string): SessionUser | null {
  try {
    const payload = jwt.verify(token, secret()) as jwt.JwtPayload;
    if (!payload.id) return null;
    return {
      id: String(payload.id),
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role: String(payload.role ?? "user"),
    };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS * 1000,
};
