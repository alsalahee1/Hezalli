import { getTranslations } from "next-intl/server";
import {
  Banknote,
  Bike,
  CheckCircle2,
  HandCoins,
  Landmark,
  MapPinned,
  Route,
  ShieldCheck,
  Truck,
  Users,
  Wallet,
} from "lucide-react";

import {
  HowBadges,
  HowFlow,
  HowGrid,
  HowHero,
  HowSection,
} from "@/components/how/how-blocks";

export const dynamic = "force-dynamic";

// Visual "how it works" for the delivery manager: the COD cash cycle as a
// road map, their consoles as feature cards, and the alert states.
export default async function DeliveryManagerHowPage() {
  const t = await getTranslations("How");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <HowHero
        icon={Truck}
        tone="violet"
        title={t("m_title")}
        subtitle={t("m_subtitle")}
      />

      <HowSection title={t("m_flowTitle")} />
      <HowFlow
        steps={[
          {
            icon: Banknote,
            tone: "amber",
            title: t("m_s1t"),
            text: t("m_s1d"),
          },
          { icon: Bike, tone: "sky", title: t("m_s2t"), text: t("m_s2d") },
          {
            icon: HandCoins,
            tone: "violet",
            title: t("m_s3t"),
            text: t("m_s3d"),
          },
          {
            icon: ShieldCheck,
            tone: "rose",
            title: t("m_s4t"),
            text: t("m_s4d"),
          },
          {
            icon: CheckCircle2,
            tone: "emerald",
            title: t("m_s5t"),
            text: t("m_s5d"),
          },
        ]}
      />

      <HowSection title={t("m_toolsTitle")} />
      <HowGrid
        items={[
          { icon: Route, tone: "sky", title: t("m_g1t"), text: t("m_g1d") },
          { icon: Bike, tone: "violet", title: t("m_g2t"), text: t("m_g2d") },
          {
            icon: MapPinned,
            tone: "emerald",
            title: t("m_g3t"),
            text: t("m_g3d"),
          },
          {
            icon: Banknote,
            tone: "amber",
            title: t("m_g4t"),
            text: t("m_g4d"),
          },
          {
            icon: Landmark,
            tone: "slate",
            title: t("m_g5t"),
            text: t("m_g5d"),
          },
          { icon: Users, tone: "rose", title: t("m_g6t"), text: t("m_g6d") },
        ]}
      />

      <HowSection title={t("m_alertTitle")} />
      <HowBadges
        items={[
          { tone: "emerald", label: t("m_bOkT"), text: t("m_bOkD") },
          { tone: "amber", label: t("m_bWarnT"), text: t("m_bWarnD") },
          { tone: "rose", label: t("m_bStopT"), text: t("m_bStopD") },
        ]}
      />

      <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
        <Wallet className="me-1.5 inline size-4 align-text-bottom" />
        {t("m_footer")}
      </p>
    </div>
  );
}
