"use client";

import { useState } from "react";
import {
  Bike,
  Heart,
  LayoutDashboard,
  LogOut,
  MapPin,
  MapPinned,
  ShoppingBag,
  Store,
  Truck,
  User,
  Wallet,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { formatUsd } from "@/lib/products";
import { signOutAction } from "@/lib/actions/auth";
import { Popover } from "@/components/ui/popover";

const MENU_LINKS = [
  { href: "/account", key: "profile", icon: User },
  { href: "/account/orders", key: "orders", icon: ShoppingBag },
  { href: "/wishlist", key: "wishlist", icon: Heart },
  { href: "/account/addresses", key: "addresses", icon: MapPin },
] as const;

type MenuUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export function UserMenu({
  user,
  isAdmin = false,
  isSeller = false,
  isCourier = false,
  isPointOperator = false,
  isFleetOwner = false,
  walletBalance = 0,
}: {
  user: MenuUser;
  isAdmin?: boolean;
  isSeller?: boolean;
  isCourier?: boolean;
  isPointOperator?: boolean;
  isFleetOwner?: boolean;
  walletBalance?: number;
}) {
  const t = useTranslations("Header");
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  // Links that depend on the signed-in user's role. Admins reach the admin
  // panel, sellers reach their store dashboard — buyers see neither.
  const roleLinks = [
    isAdmin
      ? { href: "/admin", key: "adminPanel", icon: LayoutDashboard }
      : null,
    isSeller ? { href: "/seller", key: "sellerCenter", icon: Store } : null,
    isCourier ? { href: "/driver", key: "driverApp", icon: Bike } : null,
    isPointOperator
      ? { href: "/point", key: "pointPortal", icon: MapPinned }
      : null,
    isFleetOwner ? { href: "/fleet", key: "fleetPortal", icon: Truck } : null,
  ].filter((l): l is { href: string; key: string; icon: typeof User } =>
    Boolean(l),
  );

  const label = user.name || user.email || "";
  const initial = (label || "?").charAt(0).toUpperCase();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("account")}
        className="hover:bg-muted flex size-9 items-center justify-center rounded-full"
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            className="size-8 rounded-full object-cover"
          />
        ) : (
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-full text-sm font-semibold">
            {initial}
          </span>
        )}
      </button>

      <Popover open={open} onClose={() => setOpen(false)}>
        {(shown) => (
          <div
            role="menu"
            className={cn(
              "bg-background absolute end-0 z-50 mt-2 w-56 origin-top-right overflow-hidden rounded-md border shadow-lg transition duration-200 ease-out will-change-transform motion-reduce:transition-none rtl:origin-top-left",
              shown ? "scale-100 opacity-100" : "scale-95 opacity-0",
            )}
          >
            <div className="border-b px-3 py-2">
              <p className="truncate text-sm font-medium">{label}</p>
              {user.name && user.email ? (
                <p className="text-muted-foreground truncate text-xs">
                  {user.email}
                </p>
              ) : null}
            </div>
            <Link
              href="/account/wallet"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="hover:bg-primary/10 flex items-center justify-between gap-2 border-b px-3 py-2.5"
            >
              <span className="text-primary flex items-center gap-2 text-sm font-medium">
                <Wallet className="size-4" />
                {t("wallet")}
              </span>
              <span className="text-primary text-sm font-semibold" dir="ltr">
                {formatUsd(walletBalance, locale)}
              </span>
            </Link>
            {roleLinks.length > 0 ? (
              <div className="border-b p-1">
                {roleLinks.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      role="menuitem"
                      onClick={() => setOpen(false)}
                      className="hover:bg-muted flex items-center gap-2 rounded-sm px-3 py-2 text-sm font-medium"
                    >
                      <Icon className="size-4" />
                      {t(item.key)}
                    </Link>
                  );
                })}
              </div>
            ) : null}
            <div className="p-1">
              {MENU_LINKS.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="hover:bg-muted flex items-center gap-2 rounded-sm px-3 py-2 text-sm"
                  >
                    <Icon className="size-4" />
                    {t(item.key)}
                  </Link>
                );
              })}
            </div>
            <form action={signOutAction} className="border-t p-1">
              <button
                type="submit"
                role="menuitem"
                className="hover:bg-muted flex w-full items-center gap-2 rounded-sm px-3 py-2 text-start text-sm"
              >
                <LogOut className="size-4" />
                {t("signOut")}
              </button>
            </form>
          </div>
        )}
      </Popover>
    </div>
  );
}
