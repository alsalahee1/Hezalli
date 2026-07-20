"use client";

import { useState } from "react";
import { MoreHorizontal, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type CenterTab = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match the href exactly instead of as a path prefix (for section roots). */
  exact?: boolean;
};

/**
 * Reusable native-app-style bottom tab bar for the role "centers" (seller,
 * admin, account). Shows a handful of primary destinations plus an optional
 * "More" tab that opens a bottom sheet with everything else, so a center with
 * a long sidebar still gets a phone-friendly bar without losing any links.
 * Phones only — hidden from `md` up where each center shows its full sidebar.
 */
export function CenterTabBar({
  primary,
  moreItems = [],
  moreLabel = "More",
  ariaLabel,
  responsive = true,
}: {
  primary: CenterTab[];
  moreItems?: CenterTab[];
  moreLabel?: string;
  ariaLabel: string;
  /**
   * When true (default) the bar shows on phones only and hides at `md`, where a
   * center has its full sidebar. Set false for phone-first surfaces (the driver
   * app) that want the bar at every width.
   */
  responsive?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const hiddenAtMd = responsive ? "md:hidden" : "";

  const isActive = (tab: CenterTab) =>
    tab.exact
      ? pathname === tab.href
      : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

  const hasMore = moreItems.length > 0;
  // Light up the More tab when the current route lives only in the sheet.
  const moreActive =
    hasMore && !primary.some(isActive) && moreItems.some(isActive);

  const tabClass = (active: boolean) =>
    cn(
      "flex w-full flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors",
      active ? "text-primary" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <>
      {/* Overflow sheet */}
      {open && hasMore ? (
        <div className={cn("fixed inset-0 z-50", hiddenAtMd)}>
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="bg-background absolute inset-x-0 bottom-0 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)] shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="font-semibold">{moreLabel}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={moreLabel}
                className="hover:bg-muted rounded-md p-1"
              >
                <X className="size-5" />
              </button>
            </div>
            <ul className="grid grid-cols-3 gap-1 p-3">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center text-xs font-medium transition-colors",
                        active
                          ? "border-primary/40 bg-primary/5 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Icon className="size-5" aria-hidden />
                      <span className="line-clamp-2 leading-tight">
                        {item.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}

      <nav
        aria-label={ariaLabel}
        className={cn(
          "bg-background/95 supports-[backdrop-filter]:bg-background/85 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur",
          hiddenAtMd,
        )}
      >
        <ul className="mx-auto flex max-w-md items-stretch justify-around">
          {primary.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab);
            return (
              <li key={tab.href} className="flex-1">
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={tabClass(active)}
                >
                  <Icon
                    className="size-6"
                    strokeWidth={active ? 2.4 : 1.9}
                    aria-hidden
                  />
                  {tab.label}
                </Link>
              </li>
            );
          })}
          {hasMore ? (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setOpen(true)}
                aria-haspopup="menu"
                aria-expanded={open}
                className={tabClass(moreActive)}
              >
                <MoreHorizontal
                  className="size-6"
                  strokeWidth={moreActive ? 2.4 : 1.9}
                  aria-hidden
                />
                {moreLabel}
              </button>
            </li>
          ) : null}
        </ul>
      </nav>
    </>
  );
}
