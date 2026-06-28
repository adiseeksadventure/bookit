import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

// The Next app keeps Auth.js purely for *session* management (the signed,
// stateless JWT cookie and the SSR `auth()` helper). The actual credential
// check is delegated to the Express backend so the Next app never touches the
// database — see NOTES §1.1. Kept inline (not imported from backend.ts) to avoid
// an import cycle: backend.ts imports `auth` from here.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000";

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Store the session in a signed JWT cookie instead of the database.
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    // Runs whenever a token is created (sign-in) or updated. On sign-in the
    // `user` object is present, so we copy the extra fields onto the token.
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
      }
      return token;
    },
    // Runs whenever a session is read. We expose the token fields on
    // `session.user` so the rest of the app can read `id` and `role`.
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Verify the password against the Express backend (which owns bcrypt and
        // the users table). Whatever we return here becomes the `user` in the
        // jwt callback; returning null fails the sign-in.
        let res: Response;
        try {
          res = await fetch(`${BACKEND_URL}/api/auth/login`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
            cache: "no-store",
          });
        } catch {
          return null;
        }

        if (!res.ok) return null;
        const data = await res.json();
        if (!data?.user?.id) return null;

        return {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: data.user.role,
        };
      },
    }),
  ],
});
