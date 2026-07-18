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

// Flat, indented options for a category <select> (leaf and parent both
// selectable). Rows must include id, parentId, name, and position.
type OptionRow = {
  id: string;
  parentId: string | null;
  name: unknown;
  position: number;
};

export function categoryOptions(
  rows: OptionRow[],
  locale: string,
): { id: string; label: string }[] {
  const childrenOf = new Map<string | null, OptionRow[]>();
  for (const r of rows) {
    const list = childrenOf.get(r.parentId) ?? [];
    list.push(r);
    childrenOf.set(r.parentId, list);
  }
  for (const list of childrenOf.values())
    list.sort((a, b) => a.position - b.position);

  const out: { id: string; label: string }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const r of childrenOf.get(parentId) ?? []) {
      const prefix = depth > 0 ? `${"— ".repeat(depth)}` : "";
      out.push({ id: r.id, label: prefix + localizedName(r.name, locale) });
      walk(r.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

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
