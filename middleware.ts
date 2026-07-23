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
const PROTECTED = [
  "/seller",
  "/admin",
  "/account",
  "/wallet-manager",
  "/delivery-manager",
];

// Per-request Content-Security-Policy with a script nonce. Moving the CSP here
// (from next.config.ts) lets each HTML document carry a fresh nonce so inline
// scripts no longer need 'unsafe-inline' — Next.js reads the nonce from the
// request's CSP header and stamps it onto the framework's inline bootstrap.
// Styles keep 'unsafe-inline' (Tailwind/inline styles); the other security
// headers stay global in next.config.ts (they must also cover /api + assets).
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

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

  const nonce = crypto.randomUUID().replace(/-/g, "");
  const csp = buildCsp(nonce);
  // Expose the nonce + CSP to the downstream RSC renderer via request headers so
  // Next.js applies the nonce to the scripts it injects.
  req.headers.set("x-nonce", nonce);
  req.headers.set("content-security-policy", csp);

  if (needsAuth && !req.auth) {
    const loginUrl = new URL(`/${locale}/login`, nextUrl);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
    const redirect = NextResponse.redirect(loginUrl);
    redirect.headers.set("content-security-policy", csp);
    return redirect;
  }

  const res = intlMiddleware(req);
  res.headers.set("content-security-policy", csp);
  return res;
});

export const config = {
  // Match all pathnames except API routes, Next internals, and files with
  // an extension (e.g. images, fonts).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
