"use client";

import { ClipboardList, History, QrCode, Trophy, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Tab = { href: string; label: string; icon: LucideIcon; exact?: boolean };

/**
 * Bottom bar for the Hezalli Express driver app, styled like the HezalliPay
 * wallet bar (components/wallet/wallet-tab-bar.tsx): flat tabs flanking an
 * elevated center Scan button, so scanning a parcel is the obvious primary
 * action the same way "scan to pay" is in the wallet. Phone-first but kept at
 * every width — the driver app runs in a narrow desktop column with no sidebar.
 */
export function DriverTabBar() {
  const t = useTranslations("Driver");
  const pathname = usePathname();

  const isActive = (tab: Tab) =>
    tab.exact
      ? pathname === tab.href
      : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

  const left: Tab[] = [
    { href: "/driver", label: t("jobs"), icon: ClipboardList, exact: true },
    { href: "/driver/history", label: t("history"), icon: History },
  ];
  const right: Tab[] = [
    { href: "/driver/ledger", label: t("ledger"), icon: Wallet },
    { href: "/driver/stats", label: t("statsTab"), icon: Trophy },
  ];
  const scanActive =
    pathname === "/driver/scan" || pathname.startsWith("/driver/scan/");

  const cls = (active: boolean) =>
    cn(
      "flex w-full flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors",
      active ? "text-primary" : "text-muted-foreground hover:text-foreground",
    );

  const iconWrapCls = (active: boolean) =>
    cn(
      "flex size-9 items-center justify-center rounded-lg transition-colors",
      active && "bg-primary/15",
    );

  const renderTab = (tab: Tab) => {
    const Icon = tab.icon;
    const active = isActive(tab);
    return (
      <li key={tab.href} className="flex-1">
        <Link
          href={tab.href}
          aria-current={active ? "page" : undefined}
          className={cls(active)}
        >
          <span className={iconWrapCls(active)}>
            <Icon
              className="size-5"
              strokeWidth={active ? 2.2 : 1.9}
              aria-hidden
            />
          </span>
          {tab.label}
        </Link>
      </li>
    );
  };

  return (
    <nav
      aria-label={t("appName")}
      className="bg-background/95 supports-[backdrop-filter]:bg-background/85 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {left.map(renderTab)}

        {/* Elevated center action — mirrors the wallet's raised Scan button. */}
        <li className="flex-1">
          <Link
            href="/driver/scan"
            aria-current={scanActive ? "page" : undefined}
            aria-label={t("scan")}
            className="text-primary flex w-full flex-col items-center gap-1 pb-2 text-[11px] font-medium"
          >
            <span className="ring-background bg-primary text-primary-foreground -mt-7 flex size-14 items-center justify-center rounded-full shadow-lg ring-4">
              <QrCode className="size-7" aria-hidden />
            </span>
            {t("scan")}
          </Link>
        </li>

        {right.map(renderTab)}
      </ul>
    </nav>
  );
}
