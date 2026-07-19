"use client";

import {
  Gift,
  Link2,
  Lock,
  MapPin,
  ShoppingBag,
  User,
  Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/account", key: "profile", icon: User, exact: true },
  { href: "/account/addresses", key: "addresses", icon: MapPin },
  { href: "/account/security", key: "security", icon: Lock },
  { href: "/account/orders", key: "orders", icon: ShoppingBag },
  { href: "/account/wallet", key: "wallet", icon: Wallet },
  { href: "/account/loyalty", key: "loyalty", icon: Gift },
  { href: "/account/link-telegram", key: "connections", icon: Link2 },
] as const;

export function AccountNav() {
  const t = useTranslations("Account");
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const active =
          "exact" in item && item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
