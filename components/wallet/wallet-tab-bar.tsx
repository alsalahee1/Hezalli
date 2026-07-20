"use client";

import {
  ArrowDownToLine,
  ArrowUpRight,
  ReceiptText,
  Store,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Custom events the wallet action forms listen for so the bottom bar can open
// them without the page having to lift each form's local open state.
export const WALLET_OPEN_TOPUP = "wallet:open-topup";
export const WALLET_OPEN_SEND = "wallet:open-send";

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

/**
 * Wallet-specific bottom tab bar. The storefront's default MobileTabBar hides
 * on the wallet route and this takes its place, so the bar reflects wallet
 * actions (top up, send, history) instead of shopping tabs — the way a banking
 * app swaps its bottom bar per section. Phones only; hidden from `md` up.
 */
export function WalletTabBar({
  canTopUp = false,
  canSend = false,
}: {
  canTopUp?: boolean;
  canSend?: boolean;
}) {
  const t = useTranslations("WalletNav");

  type Item = {
    key: string;
    icon: LucideIcon;
    onClick?: () => void;
    href?: string;
    primary?: boolean;
  };

  const items: Item[] = [
    { key: "overview", icon: Wallet, onClick: scrollToTop, primary: true },
    ...(canTopUp
      ? [
          {
            key: "topUp",
            icon: ArrowDownToLine,
            onClick: () =>
              window.dispatchEvent(new CustomEvent(WALLET_OPEN_TOPUP)),
          } satisfies Item,
        ]
      : []),
    ...(canSend
      ? [
          {
            key: "send",
            icon: ArrowUpRight,
            onClick: () =>
              window.dispatchEvent(new CustomEvent(WALLET_OPEN_SEND)),
          } satisfies Item,
        ]
      : []),
    {
      key: "history",
      icon: ReceiptText,
      onClick: () => scrollToId("wallet-history"),
    },
    { key: "exit", icon: Store, href: "/" },
  ];

  const cls = (primary?: boolean) =>
    cn(
      "flex w-full flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors",
      primary ? "text-primary" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <nav
      aria-label={t("label")}
      className="bg-background/95 supports-[backdrop-filter]:bg-background/85 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.key} className="flex-1">
              {item.href ? (
                <Link href={item.href} className={cls(item.primary)}>
                  <Icon
                    className="size-6"
                    strokeWidth={item.primary ? 2.4 : 1.9}
                    aria-hidden
                  />
                  {t(item.key)}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={item.onClick}
                  className={cls(item.primary)}
                >
                  <Icon
                    className="size-6"
                    strokeWidth={item.primary ? 2.4 : 1.9}
                    aria-hidden
                  />
                  {t(item.key)}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
