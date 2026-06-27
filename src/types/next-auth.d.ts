import { DefaultSession } from "next-auth";

// These declarations extend NextAuth's built-in types so that our custom
// fields (`id` and `role`) are type-safe everywhere we read the session,
// the token, or the user returned from `authorize`.

declare module "next-auth" {
  // The object returned by the Credentials `authorize` callback.
  interface User {
    role: string;
  }

  // The session returned by `auth()` (server) and `useSession()` (client).
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }
}

// The `JWT` interface is defined in `@auth/core/jwt` and only re-exported by
// `next-auth/jwt`. The `jwt`/`session` callbacks reference the original, so we
// augment the source module to make `token.id`/`token.role` type-safe.
declare module "@auth/core/jwt" {
  // The payload stored inside the encrypted session cookie.
  interface JWT {
    id: string;
    role: string;
  }
}
