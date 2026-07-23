"use client";

import { useState } from "react";
import { MoreHorizontal, X } from "lucide-react";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useMountTransition } from "@/components/ui/use-mount-transition";

export type CenterTab = {
  href: string;
  label: string;
  // Any lucide icon, or a custom glyph like ShadiIcon — anything accepting
  // SVG-ish presentational props.
  icon: React.ComponentType<{
    className?: string;
    strokeWidth?: number | string;
    "aria-hidden"?: boolean;
  }>;
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
  centerKey,
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
  /**
   * href of a primary tab to render as an elevated, circular center button
   * (the raised "Scan" treatment the wallet/driver apps use). The remaining
   * primary tabs flank it in their array order. Omit for the flat layout.
   */
  centerKey?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { mounted, shown } = useMountTransition(open);
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

  const renderTab = (tab: CenterTab) => {
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
  };

  // Elevated, circular center action — the raised "Scan" treatment shared with
  // the wallet and driver bars.
  const renderCenter = (tab: CenterTab) => {
    const Icon = tab.icon;
    return (
      <li key={tab.href} className="flex-1">
        <Link
          href={tab.href}
          aria-current={isActive(tab) ? "page" : undefined}
          aria-label={tab.label}
          className="text-primary flex w-full flex-col items-center gap-1 pb-2 text-[11px] font-medium"
        >
          <span className="ring-background bg-primary text-primary-foreground -mt-7 flex size-14 items-center justify-center rounded-full shadow-lg ring-4">
            <Icon className="size-7" aria-hidden />
          </span>
          {tab.label}
        </Link>
      </li>
    );
  };

  return (
    <>
      {/* Overflow sheet */}
      {mounted && hasMore ? (
        <div className={cn("fixed inset-0 z-50", hiddenAtMd)}>
          <div
            className={cn(
              "absolute inset-0 bg-black/50 transition-opacity duration-300 ease-out motion-reduce:transition-none",
              shown ? "opacity-100" : "opacity-0",
            )}
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className={cn(
              "bg-background absolute inset-x-0 bottom-0 max-h-[70vh] transform-gpu overflow-y-auto rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)] shadow-2xl transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform motion-reduce:transition-none",
              shown ? "translate-y-0" : "translate-y-full",
            )}
          >
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
          {primary.map((tab) =>
            tab.href === centerKey ? renderCenter(tab) : renderTab(tab),
          )}
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
