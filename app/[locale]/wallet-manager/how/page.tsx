import { getTranslations } from "next-intl/server";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BadgeCheck,
  Banknote,
  Scale,
  ShieldCheck,
  Store,
  Users,
  Wallet,
} from "lucide-react";

import {
  HowFlow,
  HowGrid,
  HowHero,
  HowSection,
} from "@/components/how/how-blocks";

export const dynamic = "force-dynamic";

// Visual "how it works" for the wallet manager: money-in and money-out as
// road maps, and each desk as a feature card.
export default async function WalletManagerHowPage() {
  const t = await getTranslations("How");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <HowHero
        icon={Wallet}
        tone="emerald"
        title={t("w_title")}
        subtitle={t("w_subtitle")}
      />

      <HowSection title={t("w_inTitle")} />
      <HowFlow
        steps={[
          {
            icon: ArrowDownToLine,
            tone: "sky",
            title: t("w_i1t"),
            text: t("w_i1d"),
          },
          {
            icon: ShieldCheck,
            tone: "violet",
            title: t("w_i2t"),
            text: t("w_i2d"),
          },
          {
            icon: Wallet,
            tone: "emerald",
            title: t("w_i3t"),
            text: t("w_i3d"),
          },
        ]}
      />

      <HowSection title={t("w_outTitle")} />
      <HowFlow
        steps={[
          {
            icon: BadgeCheck,
            tone: "violet",
            title: t("w_o1t"),
            text: t("w_o1d"),
          },
          {
            icon: ArrowUpFromLine,
            tone: "amber",
            title: t("w_o2t"),
            text: t("w_o2d"),
          },
          {
            icon: Banknote,
            tone: "emerald",
            title: t("w_o3t"),
            text: t("w_o3d"),
          },
        ]}
      />

      <HowSection title={t("w_toolsTitle")} />
      <HowGrid
        items={[
          {
            icon: Banknote,
            tone: "sky",
            title: t("w_g1t"),
            text: t("w_g1d"),
          },
          {
            icon: ArrowUpFromLine,
            tone: "amber",
            title: t("w_g2t"),
            text: t("w_g2d"),
          },
          { icon: Store, tone: "violet", title: t("w_g3t"), text: t("w_g3d") },
          {
            icon: BadgeCheck,
            tone: "emerald",
            title: t("w_g4t"),
            text: t("w_g4d"),
          },
          { icon: Scale, tone: "rose", title: t("w_g5t"), text: t("w_g5d") },
          { icon: Users, tone: "slate", title: t("w_g6t"), text: t("w_g6d") },
        ]}
      />
    </div>
  );
}
