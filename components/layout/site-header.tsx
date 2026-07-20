"use client";

import { useState } from "react";
import { Menu, Store, User, Wallet, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import type { NavCategory } from "@/lib/categories";
import { formatUsd } from "@/lib/products";
import { CartButton } from "@/components/cart/cart-button";
import { UserMenu } from "@/components/auth/user-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ChatIcon } from "@/components/chat/chat-icon";
import { Button } from "@/components/ui/button";

import { CategoryNav } from "./category-nav";
import { LanguageSwitcher } from "./language-switcher";
import { Logo } from "./logo";
import { SearchBar } from "./search-bar";

type HeaderUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export function SiteHeader({
  user,
  isSeller = false,
  isAdmin = false,
  walletBalance = 0,
  categories = [],
}: {
  user?: HeaderUser | null;
  isSeller?: boolean;
  isAdmin?: boolean;
  walletBalance?: number;
  categories?: NavCategory[];
}) {
  const t = useTranslations("Header");
  const c = useTranslations("Common");
  const locale = useLocale();
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

        <Link href="/">
          <Logo wordmark={c("appName")} markClassName="size-8" />
        </Link>

        <SearchBar className="relative hidden flex-1 md:block" />

        <div className="ms-auto flex items-center gap-1">
          {/* Desktop only — hidden on mobile to keep the header uncluttered. */}
          <div className="hidden md:flex">
            <LanguageSwitcher />
          </div>
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
            <>
              <Link
                href="/account/wallet"
                aria-label={t("wallet")}
                title={t("wallet")}
                className="border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 inline-flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-sm font-semibold transition-colors sm:px-3"
              >
                <Wallet className="size-4 shrink-0" />
                <span className="hidden sm:inline" dir="ltr">
                  {formatUsd(walletBalance, locale)}
                </span>
              </Link>
              <ChatIcon variant="buyer" />
              <NotificationBell variant="buyer" />
              <UserMenu
                user={user}
                isAdmin={isAdmin}
                isSeller={isSeller}
                walletBalance={walletBalance}
              />
            </>
          ) : (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">
                <User className="size-4" />
                <span className="hidden sm:inline">{t("signIn")}</span>
              </Link>
            </Button>
          )}
          <CartButton />
        </div>
      </div>

      <div className="px-4 pb-3 md:hidden">
        <SearchBar className="relative" />
      </div>

      {/* Mobile menu: language switcher lives here (hidden from the header row
          on mobile), so mobile users can still switch language. */}
      {menuOpen ? (
        <div className="flex items-center justify-between border-t px-4 py-3 md:hidden">
          <span className="text-muted-foreground text-sm font-medium">
            {c("language")}
          </span>
          <LanguageSwitcher />
        </div>
      ) : null}

      <CategoryNav
        categories={categories}
        mobileOpen={menuOpen}
        onNavigate={() => setMenuOpen(false)}
      />
    </header>
  );
}
