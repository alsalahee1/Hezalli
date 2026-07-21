"use client";

import { Gift, Lock, MapPin, ShoppingBag, User, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";

import { usePathname } from "@/i18n/navigation";
import {
  CenterTabBar,
  type CenterTab,
} from "@/components/layout/center-tab-bar";

/**
 * Account-center bottom bar (phones only). The storefront's MobileTabBar steps
 * aside across the account area so this contextual bar takes over — except on
 * the wallet screen, which renders its own wallet-specific bar.
 */
export function AccountTabBar() {
  const t = useTranslations("Account");
  const c = useTranslations("Common");
  const pathname = usePathname();

  // The wallet screens own their bar; don't stack two.
  if (pathname === "/account/wallet" || pathname === "/account/wallet/history")
    return null;

  const items: Record<string, CenterTab> = {
    profile: { href: "/account", label: t("profile"), icon: User, exact: true },
    orders: { href: "/account/orders", label: t("orders"), icon: ShoppingBag },
    wallet: { href: "/account/wallet", label: t("wallet"), icon: Wallet },
    loyalty: { href: "/account/loyalty", label: t("loyalty"), icon: Gift },
    addresses: {
      href: "/account/addresses",
      label: t("addresses"),
      icon: MapPin,
    },
    security: { href: "/account/security", label: t("security"), icon: Lock },
  };

  return (
    <CenterTabBar
      primary={[items.profile, items.orders, items.wallet, items.loyalty]}
      moreItems={[
        items.profile,
        items.orders,
        items.wallet,
        items.loyalty,
        items.addresses,
        items.security,
      ]}
      moreLabel={c("more")}
      ariaLabel={t("title")}
    />
  );
}
