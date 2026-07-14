"use client";

import { useState } from "react";
import { Menu, Search, ShoppingCart, Store, User, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

import { CategoryNav } from "./category-nav";
import { LanguageSwitcher } from "./language-switcher";

export function SiteHeader() {
  const t = useTranslations("Header");
  const c = useTranslations("Common");
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={c("menu")}
          aria-expanded={menuOpen}
          className="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted md:hidden"
        >
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>

        <Link href="/" className="text-xl font-bold tracking-tight">
          {c("appName")}
        </Link>

        <div className="relative hidden flex-1 md:block">
          <Search className="pointer-events-none absolute inset-y-0 my-auto ms-3 size-4 text-muted-foreground" />
          <input
            type="search"
            placeholder={c("search")}
            aria-label={c("search")}
            className="w-full rounded-md border bg-muted/40 py-2 pe-3 ps-9 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>

        <div className="ms-auto flex items-center gap-1">
          <LanguageSwitcher />
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <Link href="/seller">
              <Store className="size-4" />
              {t("becomeSeller")}
            </Link>
          </Button>
          <Button variant="ghost" size="icon" asChild>
            <Link href="/account" aria-label={t("account")}>
              <User className="size-5" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" asChild>
            <Link href="/cart" aria-label={t("cart")}>
              <ShoppingCart className="size-5" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="px-4 pb-3 md:hidden">
        <div className="relative">
          <Search className="pointer-events-none absolute inset-y-0 my-auto ms-3 size-4 text-muted-foreground" />
          <input
            type="search"
            placeholder={c("search")}
            aria-label={c("search")}
            className="w-full rounded-md border bg-muted/40 py-2 pe-3 ps-9 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>
      </div>

      <CategoryNav mobileOpen={menuOpen} onNavigate={() => setMenuOpen(false)} />
    </header>
  );
}
