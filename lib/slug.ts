// Slug helpers shared by the app and the seed script.

// URL-safe handle: lowercase words separated by single dashes.
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/["']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Arabic-only names slugify to "" (no [a-z0-9] chars); fall back to a generic
// base and let the uniqueness loop number it (store, store-2, …).
export function slugifyWithFallback(s: string, fallback: string): string {
  return slugify(s) || fallback;
}
