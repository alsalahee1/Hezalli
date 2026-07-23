"use client";

import {
  CircleHelp,
  FileText,
  History,
  Package,
  QrCode,
  Store,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { CenterTabBar } from "@/components/layout/center-tab-bar";

/**
 * Bottom bar for the Hezalli Point operator app. Same shared CenterTabBar as
 * the driver app so the installed hub app feels native at every width.
 */
export function PointTabBar() {
  const t = useTranslations("Point");
  const tCommon = useTranslations("Common");

  return (
    <CenterTabBar
      ariaLabel={t("appName")}
      responsive={false}
      moreLabel={tCommon("more")}
      primary={[
        { href: "/point", label: t("parcels"), icon: Package, exact: true },
        { href: "/point/scan", label: t("scan"), icon: QrCode },
        { href: "/point/ledger", label: t("ledger"), icon: Wallet },
        { href: "/point/history", label: t("history"), icon: History },
      ]}
      moreItems={[
        { href: "/point/stats", label: t("statsTab"), icon: TrendingUp },
        { href: "/point/statement", label: t("stmtTitle"), icon: FileText },
        { href: "/point/profile", label: t("profileTab"), icon: Store },
        { href: "/point/how", label: t("howTab"), icon: CircleHelp },
      ]}
    />
  );
}
