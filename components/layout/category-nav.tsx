"use client";

import { ChevronDown } from "lucide-react";

import { Link } from "@/i18n/navigation";
import type { NavCategory } from "@/lib/categories";
import { cn } from "@/lib/utils";

export function CategoryNav({
  categories,
  mobileOpen = false,
  onNavigate,
}: {
  categories: NavCategory[];
  mobileOpen?: boolean;
  onNavigate?: () => void;
}) {
  if (categories.length === 0) return null;

  return (
    <nav
      className={cn(
        "bg-background border-t",
        mobileOpen ? "block" : "hidden md:block",
      )}
    >
      <ul
        className={cn(
          "mx-auto max-w-7xl gap-1 px-4",
          mobileOpen
            ? "flex flex-col py-2"
            : "flex [scrollbar-width:none] overflow-x-auto py-2",
        )}
      >
        {categories.map((cat) => (
          <li
            key={cat.slug}
            className={cn(!mobileOpen && "group relative shrink-0")}
          >
            <Link
              href={`/c/${cat.slug}`}
              onClick={onNavigate}
              className="text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-1 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors"
            >
              {cat.icon ? <span aria-hidden>{cat.icon}</span> : null}
              {cat.name}
              {cat.children.length > 0 ? (
                <ChevronDown className="size-3.5 opacity-60" />
              ) : null}
            </Link>

            {cat.children.length > 0 ? (
              mobileOpen ? (
                <ul className="border-muted ms-4 border-s ps-2">
                  {cat.children.map((ch) => (
                    <li key={ch.slug}>
                      <Link
                        href={`/c/${ch.slug}`}
                        onClick={onNavigate}
                        className="text-muted-foreground hover:text-foreground block rounded-md px-3 py-1.5 text-sm"
                      >
                        {ch.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="bg-popover invisible absolute start-0 top-full z-50 min-w-48 rounded-md border p-1 opacity-0 shadow-md transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                  {cat.children.map((ch) => (
                    <li key={ch.slug}>
                      <Link
                        href={`/c/${ch.slug}`}
                        onClick={onNavigate}
                        className="hover:bg-muted block rounded-sm px-3 py-1.5 text-sm"
                      >
                        {ch.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
  );
}
