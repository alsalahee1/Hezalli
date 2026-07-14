import NextAuth from "next-auth";
import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";

import { authConfig } from "./auth.config";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);
const { auth } = NextAuth(authConfig);

// Paths (after the locale prefix) that require an authenticated user. The
// authoritative ROLE check happens server-side in the seller/admin layouts;
// this is the optimistic authentication gate (ARCHITECTURE.md §3).
const PROTECTED = ["/seller", "/admin", "/account"];

export default auth((req) => {
  const { nextUrl } = req;
  const segments = nextUrl.pathname.split("/");
  const maybeLocale = segments[1];
  const isLocale = (routing.locales as readonly string[]).includes(maybeLocale);
  const locale = isLocale ? maybeLocale : routing.defaultLocale;
  const rest =
    "/" + (isLocale ? segments.slice(2) : segments.slice(1)).join("/");

  const needsAuth = PROTECTED.some(
    (p) => rest === p || rest.startsWith(`${p}/`),
  );

  if (needsAuth && !req.auth) {
    const loginUrl = new URL(`/${locale}/login`, nextUrl);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return intlMiddleware(req);
});

export const config = {
  // Match all pathnames except API routes, Next internals, and files with
  // an extension (e.g. images, fonts).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
