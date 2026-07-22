import { getTranslations } from "next-intl/server";
import {
  Banknote,
  Bell,
  Bike,
  Clock,
  HandCoins,
  Landmark,
  Lock,
  PackageCheck,
  QrCode,
  Send,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { requireCourierId } from "@/lib/authz";
import {
  HowBadges,
  HowFlow,
  HowFormula,
  HowGrid,
  HowHero,
  HowSection,
} from "@/components/how/how-blocks";

// Visual "how it works" for drivers: the delivery day as a road map, the
// personal cash limit as a formula, and the traffic-light states.
export default async function DriverHowPage() {
  const courierId = await requireCourierId();
  if (!courierId) return null;
  const t = await getTranslations("How");

  return (
    <div className="space-y-6">
      <HowHero
        icon={Bike}
        tone="sky"
        title={t("d_title")}
        subtitle={t("d_subtitle")}
      />

      <HowSection title={t("d_flowTitle")} />
      <HowFlow
        steps={[
          { icon: Bell, tone: "sky", title: t("d_s1t"), text: t("d_s1d") },
          { icon: QrCode, tone: "violet", title: t("d_s2t"), text: t("d_s2d") },
          {
            icon: PackageCheck,
            tone: "emerald",
            title: t("d_s3t"),
            text: t("d_s3d"),
          },
          {
            icon: Banknote,
            tone: "amber",
            title: t("d_s4t"),
            text: t("d_s4d"),
          },
          {
            icon: HandCoins,
            tone: "rose",
            title: t("d_s5t"),
            text: t("d_s5d"),
          },
          {
            icon: Wallet,
            tone: "emerald",
            title: t("d_s6t"),
            text: t("d_s6d"),
          },
        ]}
      />

      <HowSection title={t("d_limitTitle")} />
      <HowFormula
        parts={[
          { label: t("d_fBase"), tone: "slate" },
          { label: t("d_fDeposit"), tone: "sky" },
          { label: t("d_fPledge"), tone: "violet" },
          { label: t("d_fTrust"), tone: "emerald" },
        ]}
        result={t("d_fResult")}
        caption={t("d_fCaption")}
      />
      <HowBadges
        items={[
          { tone: "emerald", label: t("d_bOkT"), text: t("d_bOkD") },
          { tone: "amber", label: t("d_bWarnT"), text: t("d_bWarnD") },
          { tone: "rose", label: t("d_bStopT"), text: t("d_bStopD") },
        ]}
      />

      <HowSection title={t("d_featTitle")} />
      <HowGrid
        items={[
          { icon: Clock, tone: "rose", title: t("d_g1t"), text: t("d_g1d") },
          {
            icon: HandCoins,
            tone: "amber",
            title: t("d_g2t"),
            text: t("d_g2d"),
          },
          { icon: Send, tone: "sky", title: t("d_g3t"), text: t("d_g3d") },
          { icon: Lock, tone: "violet", title: t("d_g4t"), text: t("d_g4d") },
          {
            icon: TrendingUp,
            tone: "emerald",
            title: t("d_g5t"),
            text: t("d_g5d"),
          },
          {
            icon: Landmark,
            tone: "slate",
            title: t("d_g6t"),
            text: t("d_g6d"),
          },
        ]}
      />
    </div>
  );
}
