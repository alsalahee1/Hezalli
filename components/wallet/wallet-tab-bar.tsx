"use client";

import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  ReceiptText,
  ScanLine,
  Store,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { WalletScanSheet } from "@/components/wallet/wallet-scan-sheet";

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

type Item = {
  key: string;
  icon: LucideIcon;
  onClick?: () => void;
  href?: string;
  primary?: boolean;
};

/**
 * Wallet-specific bottom tab bar. The storefront's default MobileTabBar hides
 * across the account area and this takes its place on the wallet screen, so the
 * bar reflects wallet actions instead of shopping tabs — the way a payments app
 * swaps its bottom bar. When peer-to-peer is on, the center is an elevated
 * Scan button (scan a code to pay, or show your own code to get paid). Phones
 * only; hidden from `md` up.
 */
export function WalletTabBar({
  canTopUp = false,
  canSend = false,
  canScan = false,
  myQr,
  myPayUrl = "",
}: {
  canTopUp?: boolean;
  canSend?: boolean;
  canScan?: boolean;
  myQr?: React.ReactNode;
  myPayUrl?: string;
}) {
  const t = useTranslations("WalletNav");
  const [scanOpen, setScanOpen] = useState(false);

  const overview: Item = {
    key: "overview",
    icon: Wallet,
    onClick: scrollToTop,
    primary: true,
  };
  const topUp: Item = {
    key: "topUp",
    icon: ArrowDownToLine,
    onClick: () => window.dispatchEvent(new CustomEvent(WALLET_OPEN_TOPUP)),
  };
  const send: Item = {
    key: "send",
    icon: ArrowUpRight,
    onClick: () => window.dispatchEvent(new CustomEvent(WALLET_OPEN_SEND)),
  };
  const history: Item = {
    key: "history",
    icon: ReceiptText,
    onClick: () => scrollToId("wallet-history"),
  };
  const exit: Item = { key: "exit", icon: Store, href: "/" };

  // With P2P on, the Scan center action stands in for Send (paying is now a
  // scan away); the Send form stays reachable from the page itself.
  const left = canScan
    ? [overview, ...(canTopUp ? [topUp] : [])]
    : [overview, ...(canTopUp ? [topUp] : []), ...(canSend ? [send] : [])];
  const right = [history, exit];

  const cls = (primary?: boolean) =>
    cn(
      "flex w-full flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors",
      primary ? "text-primary" : "text-muted-foreground hover:text-foreground",
    );

  const renderItem = (item: Item) => {
    const Icon = item.icon;
    const inner = (
      <>
        <Icon
          className="size-6"
          strokeWidth={item.primary ? 2.4 : 1.9}
          aria-hidden
        />
        {t(item.key)}
      </>
    );
    return (
      <li key={item.key} className="flex-1">
        {item.href ? (
          <Link href={item.href} className={cls(item.primary)}>
            {inner}
          </Link>
        ) : (
          <button
            type="button"
            onClick={item.onClick}
            className={cls(item.primary)}
          >
            {inner}
          </button>
        )}
      </li>
    );
  };

  return (
    <>
      {canScan ? (
        <WalletScanSheet
          open={scanOpen}
          onClose={() => setScanOpen(false)}
          myQr={myQr}
          myPayUrl={myPayUrl}
        />
      ) : null}

      <nav
        aria-label={t("label")}
        className="bg-background/95 supports-[backdrop-filter]:bg-background/85 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto flex max-w-md items-stretch justify-around">
          {left.map(renderItem)}

          {canScan ? (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setScanOpen(true)}
                className="text-primary flex w-full flex-col items-center gap-1 pb-2 text-[11px] font-medium"
                aria-label={t("scan")}
              >
                <span className="ring-background bg-primary text-primary-foreground -mt-7 flex size-14 items-center justify-center rounded-full shadow-lg ring-4">
                  <ScanLine className="size-7" aria-hidden />
                </span>
                {t("scan")}
              </button>
            </li>
          ) : null}

          {right.map(renderItem)}
        </ul>
      </nav>
    </>
  );
}
