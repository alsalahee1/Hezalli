"use client";

import {
  Boxes,
  CircleHelp,
  FileText,
  History,
  Map,
  Package,
  QrCode,
  Store,
  Tags,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { CenterTabBar } from "@/components/layout/center-tab-bar";
import {
  canManagePoint,
  canViewMoney,
  type PointAccess,
} from "@/lib/point-access";

/**
 * Bottom bar for the Hezalli Point operator app. Same shared CenterTabBar as
 * the driver app so the installed hub app feels native at every width.
 * Tabs follow the caller's access tier (docs §42d): money views only for
 * owner/manager/collector, the staff screen only for owner/manager — the
 * server re-gates every page, this just keeps dead tabs out of the bar.
 */
export function PointTabBar({ access }: { access: PointAccess }) {
  const t = useTranslations("Point");
  const tCommon = useTranslations("Common");

  const money = canViewMoney(access);
  const manage = canManagePoint(access);

  return (
    <CenterTabBar
      ariaLabel={t("appName")}
      responsive={false}
      maxWidthClass="max-w-md md:max-w-3xl"
      moreLabel={tCommon("more")}
      centerKey="/point/scan"
      primary={[
        { href: "/point", label: t("parcels"), icon: Package, exact: true },
        { href: "/point/history", label: t("history"), icon: History },
        { href: "/point/scan", label: t("scan"), icon: QrCode },
        money
          ? { href: "/point/ledger", label: t("ledger"), icon: Wallet }
          : { href: "/point/profile", label: t("profileTab"), icon: Store },
      ]}
      moreItems={[
        ...(money
          ? [
              { href: "/point/stats", label: t("statsTab"), icon: TrendingUp },
              {
                href: "/point/statement",
                label: t("stmtTitle"),
                icon: FileText,
              },
              { href: "/point/profile", label: t("profileTab"), icon: Store },
            ]
          : []),
        ...(manage
          ? [
              { href: "/point/staff", label: t("staffTab"), icon: Users },
              { href: "/point/labels", label: t("labelsTab"), icon: Tags },
            ]
          : []),
        { href: "/point/shelves", label: t("shelvesTab"), icon: Boxes },
        { href: "/point/layout", label: t("layoutTab"), icon: Map },
        { href: "/point/how", label: t("howTab"), icon: CircleHelp },
      ]}
    />
  );
}
