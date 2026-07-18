import { handlers } from "@/auth";

// Auth.js route handlers (sign-in callback, CSRF, session, providers). Lives
// outside the [locale] segment; the middleware matcher excludes /api.
export const { GET, POST } = handlers;
