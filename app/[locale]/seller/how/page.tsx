import { getTranslations } from "next-intl/server";
import {
  Banknote,
  MapPinned,
  Package,
  PackageCheck,
  ShoppingBag,
  Store,
  Tag,
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

export const dynamic = "force-dynamic";

// Visual "how it works" for sellers: listing → order → ship → money, plus
// the delivery network and finance features in cards.
export default async function SellerHowPage() {
  const t = await getTranslations("How");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <HowHero
        icon={Store}
        tone="emerald"
        title={t("s_title")}
        subtitle={t("s_subtitle")}
      />

      <HowSection title={t("s_flowTitle")} />
      <HowFlow
        steps={[
          { icon: Package, tone: "sky", title: t("s_s1t"), text: t("s_s1d") },
          {
            icon: ShoppingBag,
            tone: "violet",
            title: t("s_s2t"),
            text: t("s_s2d"),
          },
          { icon: Truck, tone: "amber", title: t("s_s3t"), text: t("s_s3d") },
          {
            icon: PackageCheck,
            tone: "emerald",
            title: t("s_s4t"),
            text: t("s_s4d"),
          },
          {
            icon: Banknote,
            tone: "rose",
            title: t("s_s5t"),
            text: t("s_s5d"),
          },
          {
            icon: Wallet,
            tone: "emerald",
            title: t("s_s6t"),
            text: t("s_s6d"),
          },
        ]}
      />

      <HowSection title={t("s_featTitle")} />
      <HowGrid
        items={[
          {
            icon: MapPinned,
            tone: "sky",
            title: t("s_g1t"),
            text: t("s_g1d"),
          },
          { icon: Truck, tone: "violet", title: t("s_g2t"), text: t("s_g2d") },
          {
            icon: Banknote,
            tone: "amber",
            title: t("s_g3t"),
            text: t("s_g3d"),
          },
          {
            icon: Wallet,
            tone: "emerald",
            title: t("s_g4t"),
            text: t("s_g4d"),
          },
          { icon: Undo2, tone: "rose", title: t("s_g5t"), text: t("s_g5d") },
          { icon: Tag, tone: "slate", title: t("s_g6t"), text: t("s_g6d") },
        ]}
      />
    </div>
  );
}
