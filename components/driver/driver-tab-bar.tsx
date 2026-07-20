"use client";

import { ClipboardList, QrCode } from "lucide-react";
import { useTranslations } from "next-intl";

import { CenterTabBar } from "@/components/layout/center-tab-bar";

/**
 * Bottom bar for the Hezalli Express driver app. Uses the shared CenterTabBar
 * so it matches the other centers (active-tab highlight, safe-area padding),
 * keeping the installed driver app feeling native.
 */
export function DriverTabBar() {
  const t = useTranslations("Driver");

  return (
    <CenterTabBar
      ariaLabel={t("appName")}
      primary={[
        { href: "/driver", label: t("jobs"), icon: ClipboardList, exact: true },
        { href: "/driver/scan", label: t("scan"), icon: QrCode },
      ]}
    />
  );
}
