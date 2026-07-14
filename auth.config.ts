import type { NextAuthConfig } from "next-auth";

import type { Role } from "@/lib/generated/prisma/client";

// Edge-safe Auth.js config shared between the middleware (Edge runtime) and the
// full server config in `auth.ts`. It must NOT import Prisma, node:crypto, or
// the Credentials provider — anything that touches Node APIs stays in `auth.ts`.
//
// We use JWT sessions (required by the Credentials provider) and carry the user
// id + roles in the token so both middleware and server components can read the
// role without a database round-trip.
export const authConfig = {
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        if (user.id) token.id = user.id;
        token.roles = (user as { roles?: Role[] }).roles ?? [];
      }
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id;
      session.user.roles = token.roles ?? [];
      return session;
    },
  },
} satisfies NextAuthConfig;
