"use client";

import { Package, QrCode, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";

import { CenterTabBar } from "@/components/layout/center-tab-bar";

/**
 * Bottom bar for the Hezalli Point operator app. Same shared CenterTabBar as
 * the driver app so the installed hub app feels native at every width.
 */
export function PointTabBar() {
  const t = useTranslations("Point");

  return (
    <CenterTabBar
      ariaLabel={t("appName")}
      responsive={false}
      primary={[
        { href: "/point", label: t("parcels"), icon: Package, exact: true },
        { href: "/point/scan", label: t("scan"), icon: QrCode },
        { href: "/point/ledger", label: t("ledger"), icon: Wallet },
      ]}
    />
  );
}
