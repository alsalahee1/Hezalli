import { getTranslations } from "next-intl/server";
import {
  Banknote,
  Clock,
  CreditCard,
  HandCoins,
  Landmark,
  Lock,
  MapPinned,
  PackageCheck,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";

import {
  HowFlow,
  HowGrid,
  HowHero,
  HowSection,
} from "@/components/how/how-blocks";

export const dynamic = "force-dynamic";

// Visual "how it works" for admins: the full order-to-money journey, the
// COD protection system, and who runs what.
export default async function AdminHowPage() {
  const t = await getTranslations("How");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <HowHero
        icon={ShieldCheck}
        tone="rose"
        title={t("a_title")}
        subtitle={t("a_subtitle")}
      />

      <HowSection title={t("a_flowTitle")} />
      <HowFlow
        steps={[
          {
            icon: ShoppingBag,
            tone: "sky",
            title: t("a_s1t"),
            text: t("a_s1d"),
          },
          {
            icon: CreditCard,
            tone: "violet",
            title: t("a_s2t"),
            text: t("a_s2d"),
          },
          { icon: Truck, tone: "amber", title: t("a_s3t"), text: t("a_s3d") },
          {
            icon: PackageCheck,
            tone: "emerald",
            title: t("a_s4t"),
            text: t("a_s4d"),
          },
          {
            icon: HandCoins,
            tone: "rose",
            title: t("a_s5t"),
            text: t("a_s5d"),
          },
          { icon: Store, tone: "emerald", title: t("a_s6t"), text: t("a_s6d") },
        ]}
      />

      <HowSection title={t("a_codTitle")} />
      <HowGrid
        items={[
          { icon: Clock, tone: "rose", title: t("a_g1t"), text: t("a_g1d") },
          {
            icon: Landmark,
            tone: "sky",
            title: t("a_g2t"),
            text: t("a_g2d"),
          },
          { icon: Lock, tone: "violet", title: t("a_g3t"), text: t("a_g3d") },
          {
            icon: TrendingUp,
            tone: "emerald",
            title: t("a_g4t"),
            text: t("a_g4d"),
          },
          {
            icon: Banknote,
            tone: "amber",
            title: t("a_g5t"),
            text: t("a_g5d"),
          },
          {
            icon: Wallet,
            tone: "emerald",
            title: t("a_g6t"),
            text: t("a_g6d"),
          },
        ]}
      />

      <HowSection title={t("a_staffTitle")} />
      <HowGrid
        items={[
          { icon: Truck, tone: "violet", title: t("a_r1t"), text: t("a_r1d") },
          {
            icon: Wallet,
            tone: "emerald",
            title: t("a_r2t"),
            text: t("a_r2d"),
          },
          {
            icon: MapPinned,
            tone: "sky",
            title: t("a_r3t"),
            text: t("a_r3d"),
          },
          {
            icon: Settings,
            tone: "rose",
            title: t("a_r4t"),
            text: t("a_r4d"),
          },
        ]}
      />
    </div>
  );
}
