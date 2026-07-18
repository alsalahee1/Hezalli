"use client";

import { useState } from "react";
import { Heart, LogOut, MapPin, ShoppingBag, User } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { signOutAction } from "@/lib/actions/auth";

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

export function UserMenu({ user }: { user: MenuUser }) {
  const t = useTranslations("Header");
  const [open, setOpen] = useState(false);

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

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="menu"
            className="bg-background absolute end-0 z-50 mt-2 w-56 overflow-hidden rounded-md border shadow-lg"
          >
            <div className="border-b px-3 py-2">
              <p className="truncate text-sm font-medium">{label}</p>
              {user.name && user.email ? (
                <p className="text-muted-foreground truncate text-xs">
                  {user.email}
                </p>
              ) : null}
            </div>
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
        </>
      )}
    </div>
  );
}
