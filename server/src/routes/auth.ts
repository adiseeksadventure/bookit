import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db";
import { asyncHandler } from "../lib/middleware";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
} from "../lib/auth";

export const authRouter = Router();

// POST /api/auth/signup — create an account (user|organizer). Verbatim port of
// `src/app/api/auth/signup/route.ts`; coerces any non-"organizer" role to "user".
authRouter.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const { email, password, name, role } = req.body ?? {};

    if (!email || !password || !name) {
      res
        .status(400)
        .json({ error: "Email, password and name are required" });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Email already in use" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: role === "organizer" ? "organizer" : "user",
      },
    });

    res.status(201).json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
  })
);

// POST /api/auth/login — replaces Auth.js's `/api/auth/[...nextauth]` sign-in.
// Same credentials check as the NextAuth Credentials provider (bcrypt compare),
// then mints a JWT, sets it as an httpOnly session cookie AND returns it in the
// body so a non-Next client can send it back as `Authorization: Bearer`.
authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const sessionUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
    const token = signSession(sessionUser);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions);
    res.status(200).json({ user: sessionUser, token });
  })
);

// POST /api/auth/logout — clears the session cookie (Auth.js sign-out).
authRouter.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions);
  res.status(200).json({ message: "Signed out" });
});

// GET /api/auth/session — current session or null (mirrors Auth.js's
// `/api/auth/session`). `attachUser` has already resolved req.user if the
// request carried a valid token.
authRouter.get("/session", (req, res) => {
  res.status(200).json({ user: req.user ?? null });
});
