"use client";

import { Heart, Home, Search, ShoppingCart, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useCart } from "@/components/cart/cart-provider";

type Tab = {
  href: string;
  key: "home" | "search" | "cart" | "wishlist" | "account";
  icon: LucideIcon;
  exact?: boolean;
};

const TABS: Tab[] = [
  { href: "/", key: "home", icon: Home, exact: true },
  { href: "/search", key: "search", icon: Search },
  { href: "/cart", key: "cart", icon: ShoppingCart },
  { href: "/wishlist", key: "wishlist", icon: Heart },
  { href: "/account", key: "account", icon: User },
];

/**
 * Native-app-style bottom tab bar. Fixed to the bottom of the viewport on phones
 * only (hidden from `md` up, where the full site header takes over), so the
 * storefront navigates like a mobile app instead of a scaled-down website.
 */
export function MobileTabBar({
  wishlistCount = 0,
}: {
  wishlistCount?: number;
}) {
  const t = useTranslations("MobileNav");
  const pathname = usePathname();
  const { count: cartCount } = useCart();

  // The wallet screen renders its own wallet-focused bottom bar, so the default
  // storefront bar steps aside there instead of stacking on top of it.
  if (pathname === "/account/wallet") return null;

  const badgeFor = (key: Tab["key"]) => {
    if (key === "cart") return cartCount;
    if (key === "wishlist") return wishlistCount;
    return 0;
  };

  return (
    <nav
      aria-label={t("label")}
      className="bg-background/95 supports-[backdrop-filter]:bg-background/85 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const badge = badgeFor(tab.key);

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="relative">
                  <Icon
                    className="size-6"
                    strokeWidth={active ? 2.4 : 1.9}
                    aria-hidden
                  />
                  {badge > 0 ? (
                    <span className="bg-primary text-primary-foreground absolute -end-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : null}
                </span>
                {t(tab.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
