import type { Locale } from "@/i18n/routing";

// Category.name is a localized Json blob: { ar, en }.
export type LocalizedName = { ar?: string; en?: string };

export function localizedName(name: unknown, locale: string): string {
  const n = (name ?? {}) as LocalizedName;
  if (locale === "ar") return n.ar || n.en || "";
  return n.en || n.ar || "";
}

// A top-level category with its (active) children, ready for the storefront nav.
export type NavCategory = {
  slug: string;
  name: string;
  icon: string | null;
  children: { slug: string; name: string }[];
};

type RawCategory = {
  slug: string;
  name: unknown;
  icon: string | null;
  children?: { slug: string; name: unknown }[];
};

export function toNavCategories(
  rows: RawCategory[],
  locale: Locale,
): NavCategory[] {
  return rows.map((c) => ({
    slug: c.slug,
    name: localizedName(c.name, locale),
    icon: c.icon,
    children: (c.children ?? []).map((ch) => ({
      slug: ch.slug,
      name: localizedName(ch.name, locale),
    })),
  }));
}
