"use client";

import { useState } from "react";
import { Menu, Search, ShoppingCart, Store, User, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import type { NavCategory } from "@/lib/categories";
import { UserMenu } from "@/components/auth/user-menu";
import { Button } from "@/components/ui/button";

import { CategoryNav } from "./category-nav";
import { LanguageSwitcher } from "./language-switcher";

type HeaderUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export function SiteHeader({
  user,
  isSeller = false,
  categories = [],
}: {
  user?: HeaderUser | null;
  isSeller?: boolean;
  categories?: NavCategory[];
}) {
  const t = useTranslations("Header");
  const c = useTranslations("Common");
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={c("menu")}
          aria-expanded={menuOpen}
          className="hover:bg-muted inline-flex size-9 items-center justify-center rounded-md md:hidden"
        >
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>

        <Link href="/" className="text-xl font-bold tracking-tight">
          {c("appName")}
        </Link>

        <div className="relative hidden flex-1 md:block">
          <Search className="text-muted-foreground pointer-events-none absolute inset-y-0 my-auto ms-3 size-4" />
          <input
            type="search"
            placeholder={c("search")}
            aria-label={c("search")}
            className="bg-muted/40 focus-visible:ring-ring/50 w-full rounded-md border py-2 ps-9 pe-3 text-sm outline-none focus-visible:ring-[3px]"
          />
        </div>

        <div className="ms-auto flex items-center gap-1">
          <LanguageSwitcher />
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="hidden sm:inline-flex"
          >
            <Link href={isSeller ? "/seller" : "/sell"}>
              <Store className="size-4" />
              {isSeller ? t("sellerCenter") : t("becomeSeller")}
            </Link>
          </Button>
          {user ? (
            <UserMenu user={user} />
          ) : (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">
                <User className="size-4" />
                <span className="hidden sm:inline">{t("signIn")}</span>
              </Link>
            </Button>
          )}
          <Button variant="ghost" size="icon" asChild>
            <Link href="/cart" aria-label={t("cart")}>
              <ShoppingCart className="size-5" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="px-4 pb-3 md:hidden">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute inset-y-0 my-auto ms-3 size-4" />
          <input
            type="search"
            placeholder={c("search")}
            aria-label={c("search")}
            className="bg-muted/40 focus-visible:ring-ring/50 w-full rounded-md border py-2 ps-9 pe-3 text-sm outline-none focus-visible:ring-[3px]"
          />
        </div>
      </div>

      <CategoryNav
        categories={categories}
        mobileOpen={menuOpen}
        onNavigate={() => setMenuOpen(false)}
      />
    </header>
  );
}
