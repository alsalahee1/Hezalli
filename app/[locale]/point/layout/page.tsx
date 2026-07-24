import { getTranslations } from "next-intl/server";
import {
  Boxes,
  ChevronRight,
  ClipboardCheck,
  DoorOpen,
  HandCoins,
  LayoutGrid,
  Map,
  PackageSearch,
  Route,
  ScanLine,
  ShieldCheck,
  Signpost,
  Sparkles,
  Tags,
  Users,
} from "lucide-react";

import { requireDeliveryPoint } from "@/lib/authz";
import { Link } from "@/i18n/navigation";
import {
  HowFlow,
  HowFormula,
  HowGrid,
  HowHero,
  HowLegend,
  HowSection,
} from "@/components/how/how-blocks";
import {
  CenterFloorPlan,
  ShelfCodeDiagram,
} from "@/components/point/center-floor-plan";

// Physical setup guide for a Hezalli Point: the standard floor plan, the
// shelf-coding system, and how to lay the counter out and run it day to day.
// Visual-first (a real floor plan + shelf diagram) with short, balanced text —
// the operational scan-chain lives on /point/how; this page is the room.
export default async function PointLayoutPage() {
  const gate = await requireDeliveryPoint();
  if (!gate) return null;
  const t = await getTranslations("How");
  const tp = await getTranslations("Point");

  return (
    <div className="space-y-6">
      <HowHero
        icon={Map}
        tone="sky"
        title={t("pl_title")}
        subtitle={t("pl_subtitle")}
      />

      {/* The standard floor plan + its numbered key. */}
      <HowSection title={t("pl_planTitle")} />
      <div className="rounded-2xl border p-4">
        <CenterFloorPlan
          labels={{
            building: t("pl_building"),
            entrance: t("pl_entrance"),
            z1: t("pl_z1s"),
            z2: t("pl_z2s"),
            z3: t("pl_z3s"),
            z4: t("pl_z4s"),
            z5: t("pl_z5s"),
            z6: t("pl_z6s"),
            z7: t("pl_z7s"),
            flowIn: t("pl_flowIn"),
            flowOut: t("pl_flowOut"),
          }}
        />
      </div>
      <HowLegend
        items={[
          { n: 1, tone: "sky", title: t("pl_z1t"), text: t("pl_z1d") },
          { n: 2, tone: "slate", title: t("pl_z2t"), text: t("pl_z2d") },
          { n: 3, tone: "violet", title: t("pl_z3t"), text: t("pl_z3d") },
          { n: 4, tone: "emerald", title: t("pl_z4t"), text: t("pl_z4d") },
          { n: 5, tone: "amber", title: t("pl_z5t"), text: t("pl_z5d") },
          { n: 6, tone: "sky", title: t("pl_z6t"), text: t("pl_z6d") },
          { n: 7, tone: "rose", title: t("pl_z7t"), text: t("pl_z7d") },
        ]}
      />

      {/* Shelf coding — matches the shelfCode typed at the receive scan. */}
      <HowSection title={t("pl_shelfTitle")} />
      <div className="grid items-center gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border p-4">
          <ShelfCodeDiagram
            labels={{
              rowsLabel: t("pl_shelfRows"),
              colsLabel: t("pl_shelfCols"),
              example: "B3",
              exampleCaption: t("pl_shelfExample"),
            }}
          />
        </div>
        <div className="space-y-3">
          <HowFormula
            parts={[
              { label: t("pl_shelfRows"), tone: "violet" },
              { label: t("pl_shelfCols"), tone: "sky" },
            ]}
            result="B3"
            caption={t("pl_shelfFormulaCap")}
          />
          <HowGrid
            items={[
              {
                icon: Tags,
                tone: "violet",
                title: t("pl_sh1t"),
                text: t("pl_sh1d"),
              },
              {
                icon: ScanLine,
                tone: "sky",
                title: t("pl_sh2t"),
                text: t("pl_sh2d"),
              },
            ]}
          />
          {/* Print QR labels for the bays so shelf codes are scanned, never
              typed, at the receive scan. */}
          <Link
            href="/point/labels"
            className="hover:bg-muted/40 flex items-center gap-3 rounded-xl border p-3 transition-colors"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <Tags className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">
                {tp("labelsCalloutTitle")}
              </span>
              <span className="text-muted-foreground block truncate text-xs">
                {tp("labelsCalloutBody")}
              </span>
            </span>
            <ChevronRight className="text-muted-foreground size-4 shrink-0 rtl:rotate-180" />
          </Link>
        </div>
      </div>

      {/* Set-up roadmap. */}
      <HowSection title={t("pl_setupTitle")} />
      <HowFlow
        steps={[
          {
            icon: LayoutGrid,
            tone: "sky",
            title: t("pl_u1t"),
            text: t("pl_u1d"),
          },
          {
            icon: Boxes,
            tone: "violet",
            title: t("pl_u2t"),
            text: t("pl_u2d"),
          },
          {
            icon: Signpost,
            tone: "amber",
            title: t("pl_u3t"),
            text: t("pl_u3d"),
          },
          {
            icon: Users,
            tone: "emerald",
            title: t("pl_u4t"),
            text: t("pl_u4d"),
          },
          {
            icon: ClipboardCheck,
            tone: "rose",
            title: t("pl_u5t"),
            text: t("pl_u5d"),
          },
        ]}
      />

      {/* Stations → who stands where (mirrors the PointStaff roles). */}
      <HowSection title={t("pl_stationsTitle")} />
      <HowGrid
        items={[
          {
            icon: PackageSearch,
            tone: "violet",
            title: t("pl_st1t"),
            text: t("pl_st1d"),
          },
          {
            icon: HandCoins,
            tone: "amber",
            title: t("pl_st2t"),
            text: t("pl_st2d"),
          },
          {
            icon: ClipboardCheck,
            tone: "emerald",
            title: t("pl_st3t"),
            text: t("pl_st3d"),
          },
          {
            icon: Users,
            tone: "sky",
            title: t("pl_st4t"),
            text: t("pl_st4d"),
          },
        ]}
      />

      {/* Daily discipline that keeps the plan working. */}
      <HowSection title={t("pl_ruleTitle")} />
      <HowGrid
        items={[
          {
            icon: Route,
            tone: "emerald",
            title: t("pl_r1t"),
            text: t("pl_r1d"),
          },
          {
            icon: DoorOpen,
            tone: "sky",
            title: t("pl_r2t"),
            text: t("pl_r2d"),
          },
          {
            icon: ShieldCheck,
            tone: "amber",
            title: t("pl_r3t"),
            text: t("pl_r3d"),
          },
          {
            icon: Sparkles,
            tone: "violet",
            title: t("pl_r4t"),
            text: t("pl_r4d"),
          },
        ]}
      />
    </div>
  );
}
