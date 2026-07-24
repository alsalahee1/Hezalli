"use client";

import { QrCode, ReceiptText, Store, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";

import { CenterTabBar } from "@/components/layout/center-tab-bar";

/**
 * Bottom bar for the HezalliPay merchant app. Uses the same shared CenterTabBar
 * as the driver / point apps so the installed shop app feels native at every
 * width. The raised center button is "Charge" — the primary counter action.
 */
export function MerchantTabBar() {
  const t = useTranslations("Merchant");

  return (
    <CenterTabBar
      ariaLabel={t("appName")}
      responsive={false}
      maxWidthClass="max-w-md md:max-w-2xl"
      centerKey="/merchant/charge"
      primary={[
        { href: "/merchant", label: t("homeTab"), icon: Wallet, exact: true },
        {
          href: "/merchant/transactions",
          label: t("txTab"),
          icon: ReceiptText,
        },
        { href: "/merchant/charge", label: t("chargeTab"), icon: QrCode },
        { href: "/merchant/qr", label: t("storeQrTab"), icon: QrCode },
        { href: "/merchant/profile", label: t("profileTab"), icon: Store },
      ]}
    />
  );
}
