import { getTranslations } from "next-intl/server";
import {
  Archive,
  ArrowLeftRight,
  Banknote,
  Clock,
  FileText,
  HandCoins,
  Inbox,
  QrCode,
  RotateCcw,
  Send,
  ShoppingBag,
  Store,
  Wallet,
} from "lucide-react";

import { requireDeliveryPoint } from "@/lib/authz";
import {
  HowBadges,
  HowFlow,
  HowFormula,
  HowGrid,
  HowHero,
  HowSection,
} from "@/components/how/how-blocks";

// Visual "how it works" for Hezalli Point operators: the parcel day as a
// scan chain, the cash limit as a formula, and the counter features.
export default async function PointHowPage() {
  const gate = await requireDeliveryPoint();
  if (!gate) return null;
  const t = await getTranslations("How");

  return (
    <div className="space-y-6">
      <HowHero
        icon={Store}
        tone="violet"
        title={t("p_title")}
        subtitle={t("p_subtitle")}
      />

      <HowSection title={t("p_flowTitle")} />
      <HowFlow
        steps={[
          { icon: Inbox, tone: "sky", title: t("p_s1t"), text: t("p_s1d") },
          { icon: QrCode, tone: "violet", title: t("p_s2t"), text: t("p_s2d") },
          {
            icon: ShoppingBag,
            tone: "emerald",
            title: t("p_s3t"),
            text: t("p_s3d"),
          },
          {
            icon: RotateCcw,
            tone: "amber",
            title: t("p_s4t"),
            text: t("p_s4d"),
          },
          {
            icon: HandCoins,
            tone: "rose",
            title: t("p_s5t"),
            text: t("p_s5d"),
          },
          {
            icon: Wallet,
            tone: "emerald",
            title: t("p_s6t"),
            text: t("p_s6d"),
          },
        ]}
      />

      <HowSection title={t("p_limitTitle")} />
      <HowFormula
        parts={[
          { label: t("p_fBase"), tone: "slate" },
          { label: t("p_fDeposit"), tone: "sky" },
        ]}
        result={t("p_fResult")}
        caption={t("p_fCaption")}
      />
      <HowBadges
        items={[
          { tone: "emerald", label: t("p_bOkT"), text: t("p_bOkD") },
          { tone: "amber", label: t("p_bWarnT"), text: t("p_bWarnD") },
          { tone: "rose", label: t("p_bStopT"), text: t("p_bStopD") },
        ]}
      />

      <HowSection title={t("p_featTitle")} />
      <HowGrid
        items={[
          { icon: Archive, tone: "sky", title: t("p_g1t"), text: t("p_g1d") },
          {
            icon: ArrowLeftRight,
            tone: "violet",
            title: t("p_g2t"),
            text: t("p_g2d"),
          },
          { icon: Clock, tone: "rose", title: t("p_g3t"), text: t("p_g3d") },
          {
            icon: Banknote,
            tone: "amber",
            title: t("p_g4t"),
            text: t("p_g4d"),
          },
          { icon: Send, tone: "emerald", title: t("p_g5t"), text: t("p_g5d") },
          {
            icon: FileText,
            tone: "slate",
            title: t("p_g6t"),
            text: t("p_g6d"),
          },
        ]}
      />
    </div>
  );
}
