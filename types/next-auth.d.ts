import type { DefaultSession } from "next-auth";

import type { Role } from "@/lib/generated/prisma/client";

// Augment Auth.js types so the session/JWT carry the user id and roles that our
// callbacks populate (see auth.config.ts).

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roles: Role[];
    } & DefaultSession["user"];
  }

  // The object returned by the Credentials `authorize` callback.
  interface User {
    roles?: Role[];
  }
}

// The JWT interface is declared in @auth/core/jwt; next-auth/jwt only
// re-exports it, so augment the source module for the merge to take effect.
declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    roles?: Role[];
  }
}
