import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";

import { authConfig } from "./auth.config";

// Full server-side Auth.js setup (Node runtime). The Prisma adapter keeps the
// Account/Session/VerificationToken tables ready for Google OAuth (Step 3.3);
// with JWT sessions it is unused by credentials login but harmless.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // The generated client (custom output path) is structurally the Prisma
  // client the adapter expects, but its nominal type differs, so cast here.
  adapter: PrismaAdapter(prisma as never),
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash || user.isSuspended || user.deletedAt)
          return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          roles: user.roles,
        };
      },
    }),
  ],
});
