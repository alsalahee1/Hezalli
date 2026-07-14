"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { slug: "electronics", key: "electronics" },
  { slug: "phones-accessories", key: "phones" },
  { slug: "fashion-apparel", key: "fashion" },
  { slug: "home-kitchen", key: "home" },
  { slug: "health-beauty", key: "beauty" },
  { slug: "groceries-food", key: "groceries" },
  { slug: "baby-kids-toys", key: "baby" },
  { slug: "books-stationery", key: "books" },
  { slug: "sports-outdoors", key: "sports" },
  { slug: "automotive-tools", key: "automotive" },
] as const;

export function CategoryNav({
  mobileOpen = false,
  onNavigate,
}: {
  mobileOpen?: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("Categories");

  return (
    <nav
      className={cn(
        "border-t bg-background",
        mobileOpen ? "block" : "hidden md:block",
      )}
    >
      <ul
        className={cn(
          "mx-auto max-w-7xl gap-1 px-4",
          mobileOpen
            ? "flex flex-col py-2"
            : "flex overflow-x-auto py-2 [scrollbar-width:none]",
        )}
      >
        {CATEGORIES.map((cat) => (
          <li key={cat.slug}>
            <Link
              href={`/c/${cat.slug}`}
              onClick={onNavigate}
              className="block whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {t(cat.key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
