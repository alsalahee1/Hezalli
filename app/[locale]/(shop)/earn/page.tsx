import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  ArrowRight,
  BadgePercent,
  Banknote,
  Bike,
  ClipboardCheck,
  Clock,
  Coins,
  HandCoins,
  Headphones,
  ListChecks,
  MapPin,
  MapPinned,
  PackageCheck,
  QrCode,
  ScanLine,
  ShieldCheck,
  Store,
  Truck,
  UserCheck,
  Wallet,
} from "lucide-react";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { HowFlow, HowGrid, HowHero } from "@/components/how/how-blocks";
import { PhoneShot } from "@/components/express/express-blocks";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Earn");
  return { title: t("metaTitle") };
}

// "Earn with Hezalli" — one public hub that gathers the three money-making
// paths (sell / deliver / run a point) into a single infographic-driven page.
// It SELLS each path with a road map, real app screenshots and benefits, then
// links out to the existing signup pages (/sell, /drive, /point-partner) which
// keep the actual forms and auth/pending-state handling. No login required.
export default async function EarnPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Earn");

  // The three earning paths, summarised for the "which one is for you?" chooser.
  const paths = [
    {
      icon: Store,
      tone: "emerald" as const,
      name: t("sellName"),
      best: t("sellBest"),
      earn: t("sellEarn"),
      approval: t("badgeInstant"),
      approvalTone: "instant" as const,
      href: "/sell",
      anchor: "#sell",
    },
    {
      icon: Truck,
      tone: "violet" as const,
      name: t("deliverName"),
      best: t("deliverBest"),
      earn: t("deliverEarn"),
      approval: t("badgeReview"),
      approvalTone: "review" as const,
      href: "/drive",
      anchor: "#deliver",
    },
    {
      icon: MapPinned,
      tone: "amber" as const,
      name: t("pointName"),
      best: t("pointBest"),
      earn: t("pointEarn"),
      approval: t("badgeReview"),
      approvalTone: "review" as const,
      href: "/point-partner",
      anchor: "#point",
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-16 px-4 py-10">
      <HowHero
        icon={Coins}
        tone="amber"
        title={t("heroTitle")}
        subtitle={t("heroSubtitle")}
      />

      {/* Chooser — "which one is for you?" */}
      <section className="space-y-6">
        <div>
          <p className="text-primary text-xs font-semibold tracking-wide uppercase">
            {t("chooseEyebrow")}
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
            {t("chooseTitle")}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm text-pretty">
            {t("chooseSubtitle")}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {paths.map((p) => (
            <a
              key={p.href}
              href={p.anchor}
              className="group hover:border-primary/40 hover:bg-muted/40 flex flex-col rounded-xl border p-4 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span
                  className={
                    p.tone === "emerald"
                      ? "flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : p.tone === "violet"
                        ? "flex size-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400"
                        : "flex size-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  }
                >
                  <p.icon className="size-5" />
                </span>
                <span className="font-semibold">{p.name}</span>
              </div>
              <p className="text-muted-foreground mt-3 text-sm">{p.best}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium">
                  <HandCoins className="size-3" />
                  {p.earn}
                </span>
                <span
                  className={
                    p.approvalTone === "instant"
                      ? "inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400"
                      : "inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-400"
                  }
                >
                  {p.approvalTone === "instant" ? (
                    <Wallet className="size-3" />
                  ) : (
                    <ClipboardCheck className="size-3" />
                  )}
                  {p.approval}
                </span>
              </div>
              <span className="text-primary mt-4 inline-flex items-center gap-1 text-sm font-medium">
                {t("learnMore")}
                <ArrowRight className="size-4 rtl:rotate-180" />
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* Sell */}
      <section id="sell" className="scroll-mt-24 space-y-6">
        <div>
          <p className="text-xs font-semibold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">
            {t("sellEyebrow")}
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
            {t("sellTitle")}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm text-pretty">
            {t("sellSubtitle")}
          </p>
        </div>

        <div className="grid items-start gap-8 sm:grid-cols-[1fr_auto]">
          <HowFlow
            steps={[
              {
                icon: Store,
                tone: "emerald",
                title: t("sell_s1t"),
                text: t("sell_s1d"),
              },
              {
                icon: ListChecks,
                tone: "sky",
                title: t("sell_s2t"),
                text: t("sell_s2d"),
              },
              {
                icon: Truck,
                tone: "violet",
                title: t("sell_s3t"),
                text: t("sell_s3d"),
              },
              {
                icon: Banknote,
                tone: "amber",
                title: t("sell_s4t"),
                text: t("sell_s4d"),
              },
            ]}
          />
          <PhoneShot
            src="/earn/sell.png"
            width={860}
            height={1760}
            alt={t("sellTitle")}
            caption={t("sellShot")}
          />
        </div>

        <HowGrid
          items={[
            {
              icon: MapPin,
              tone: "emerald",
              title: t("sell_b1t"),
              text: t("sell_b1d"),
            },
            {
              icon: BadgePercent,
              tone: "amber",
              title: t("sell_b2t"),
              text: t("sell_b2d"),
            },
            {
              icon: Wallet,
              tone: "violet",
              title: t("sell_b3t"),
              text: t("sell_b3d"),
            },
            {
              icon: ListChecks,
              tone: "sky",
              title: t("sell_b4t"),
              text: t("sell_b4d"),
            },
          ]}
        />

        <Button asChild size="lg">
          <Link href="/sell">
            {t("sellCta")}
            <ArrowRight className="size-4 rtl:rotate-180" />
          </Link>
        </Button>
      </section>

      {/* Deliver */}
      <section id="deliver" className="scroll-mt-24 space-y-6">
        <div>
          <p className="text-xs font-semibold tracking-wide text-violet-600 uppercase dark:text-violet-400">
            {t("deliverEyebrow")}
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
            {t("deliverTitle")}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm text-pretty">
            {t("deliverSubtitle")}
          </p>
        </div>

        <div className="grid items-start gap-8 sm:grid-cols-[1fr_auto]">
          <HowFlow
            steps={[
              {
                icon: UserCheck,
                tone: "sky",
                title: t("deliver_s1t"),
                text: t("deliver_s1d"),
              },
              {
                icon: ShieldCheck,
                tone: "violet",
                title: t("deliver_s2t"),
                text: t("deliver_s2d"),
              },
              {
                icon: ListChecks,
                tone: "amber",
                title: t("deliver_s3t"),
                text: t("deliver_s3d"),
              },
              {
                icon: Bike,
                tone: "emerald",
                title: t("deliver_s4t"),
                text: t("deliver_s4d"),
              },
            ]}
          />
          <PhoneShot
            src="/earn/deliver.png"
            width={860}
            height={1760}
            alt={t("deliverTitle")}
            caption={t("deliverShot")}
          />
        </div>

        <HowGrid
          items={[
            {
              icon: Banknote,
              tone: "emerald",
              title: t("deliver_b1t"),
              text: t("deliver_b1d"),
            },
            {
              icon: Clock,
              tone: "amber",
              title: t("deliver_b2t"),
              text: t("deliver_b2d"),
            },
            {
              icon: MapPin,
              tone: "sky",
              title: t("deliver_b3t"),
              text: t("deliver_b3d"),
            },
            {
              icon: QrCode,
              tone: "violet",
              title: t("deliver_b4t"),
              text: t("deliver_b4d"),
            },
          ]}
        />

        <Button asChild size="lg">
          <Link href="/drive">
            {t("deliverCta")}
            <ArrowRight className="size-4 rtl:rotate-180" />
          </Link>
        </Button>
      </section>

      {/* Point Center */}
      <section id="point" className="scroll-mt-24 space-y-6">
        <div>
          <p className="text-xs font-semibold tracking-wide text-amber-600 uppercase dark:text-amber-400">
            {t("pointEyebrow")}
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
            {t("pointTitle")}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm text-pretty">
            {t("pointSubtitle")}
          </p>
        </div>

        <div className="grid items-start gap-8 sm:grid-cols-[1fr_auto]">
          <HowFlow
            steps={[
              {
                icon: Store,
                tone: "amber",
                title: t("point_s1t"),
                text: t("point_s1d"),
              },
              {
                icon: ShieldCheck,
                tone: "violet",
                title: t("point_s2t"),
                text: t("point_s2d"),
              },
              {
                icon: ScanLine,
                tone: "sky",
                title: t("point_s3t"),
                text: t("point_s3d"),
              },
              {
                icon: HandCoins,
                tone: "emerald",
                title: t("point_s4t"),
                text: t("point_s4d"),
              },
            ]}
          />
          <PhoneShot
            src="/earn/point.png"
            width={860}
            height={1760}
            alt={t("pointTitle")}
            caption={t("pointShot")}
          />
        </div>

        <HowGrid
          items={[
            {
              icon: HandCoins,
              tone: "emerald",
              title: t("point_b1t"),
              text: t("point_b1d"),
            },
            {
              icon: Store,
              tone: "amber",
              title: t("point_b2t"),
              text: t("point_b2d"),
            },
            {
              icon: QrCode,
              tone: "sky",
              title: t("point_b3t"),
              text: t("point_b3d"),
            },
            {
              icon: PackageCheck,
              tone: "violet",
              title: t("point_b4t"),
              text: t("point_b4d"),
            },
          ]}
        />

        <Button asChild size="lg">
          <Link href="/point-partner">
            {t("pointCta")}
            <ArrowRight className="size-4 rtl:rotate-180" />
          </Link>
        </Button>
      </section>

      {/* Payouts & trust */}
      <section className="space-y-6">
        <div>
          <p className="text-primary text-xs font-semibold tracking-wide uppercase">
            {t("trustEyebrow")}
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
            {t("trustTitle")}
          </h2>
        </div>

        <HowGrid
          items={[
            {
              icon: Wallet,
              tone: "emerald",
              title: t("trust_1t"),
              text: t("trust_1d"),
            },
            {
              icon: Banknote,
              tone: "amber",
              title: t("trust_2t"),
              text: t("trust_2d"),
            },
            {
              icon: ShieldCheck,
              tone: "sky",
              title: t("trust_3t"),
              text: t("trust_3d"),
            },
            {
              icon: Headphones,
              tone: "violet",
              title: t("trust_4t"),
              text: t("trust_4d"),
            },
          ]}
        />
      </section>

      <p className="text-muted-foreground border-t pt-6 text-center text-xs text-pretty">
        {t("footerNote")}
      </p>
    </div>
  );
}
