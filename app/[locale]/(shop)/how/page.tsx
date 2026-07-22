import { getTranslations } from "next-intl/server";
import {
  Banknote,
  CreditCard,
  HandCoins,
  MapPinned,
  PackageCheck,
  QrCode,
  ShoppingBag,
  Truck,
  Undo2,
  Wallet,
} from "lucide-react";

import {
  HowFlow,
  HowGrid,
  HowHero,
  HowSection,
} from "@/components/how/how-blocks";

// Public "how it works" for buyers: the shopping journey as a road map and
// the trust features (COD, doorstep wallet pay, pickup points, delivery QR)
// as visual cards. No login needed — linked from the storefront footer.
export default async function BuyerHowPage() {
  const t = await getTranslations("How");

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <HowHero
        icon={ShoppingBag}
        tone="emerald"
        title={t("b_title")}
        subtitle={t("b_subtitle")}
      />

      <HowSection title={t("b_flowTitle")} />
      <HowFlow
        steps={[
          {
            icon: ShoppingBag,
            tone: "sky",
            title: t("b_s1t"),
            text: t("b_s1d"),
          },
          {
            icon: CreditCard,
            tone: "violet",
            title: t("b_s2t"),
            text: t("b_s2d"),
          },
          { icon: Truck, tone: "amber", title: t("b_s3t"), text: t("b_s3d") },
          { icon: QrCode, tone: "rose", title: t("b_s4t"), text: t("b_s4d") },
          {
            icon: Wallet,
            tone: "emerald",
            title: t("b_s5t"),
            text: t("b_s5d"),
          },
          {
            icon: PackageCheck,
            tone: "emerald",
            title: t("b_s6t"),
            text: t("b_s6d"),
          },
        ]}
      />

      <HowSection title={t("b_featTitle")} />
      <HowGrid
        items={[
          {
            icon: Banknote,
            tone: "amber",
            title: t("b_g1t"),
            text: t("b_g1d"),
          },
          {
            icon: Wallet,
            tone: "emerald",
            title: t("b_g2t"),
            text: t("b_g2d"),
          },
          {
            icon: MapPinned,
            tone: "sky",
            title: t("b_g3t"),
            text: t("b_g3d"),
          },
          { icon: QrCode, tone: "violet", title: t("b_g4t"), text: t("b_g4d") },
          {
            icon: HandCoins,
            tone: "slate",
            title: t("b_g5t"),
            text: t("b_g5d"),
          },
          { icon: Undo2, tone: "rose", title: t("b_g6t"), text: t("b_g6d") },
        ]}
      />
    </div>
  );
}
