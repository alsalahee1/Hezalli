import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Bell,
  Bike,
  Camera,
  Clock3,
  HandCoins,
  LayoutGrid,
  MapPinned,
  Package,
  PackageCheck,
  QrCode,
  Radar,
  Repeat,
  ScanLine,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Truck,
  UserCheck,
  Wallet,
  Zap,
} from "lucide-react";

import { HowFlow, HowGrid, HowHero } from "@/components/how/how-blocks";
import {
  ConfigTable,
  DesktopShot,
  PhoneShot,
  RoadmapGrid,
} from "@/components/express/express-blocks";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Express");
  return { title: t("metaTitle") };
}

// Full-depth showcase of Hezalli Express: real product screenshots (buyer
// checkout, seller ship, dispatch, driver app, tracking, Hezalli Points)
// alongside the icon infographics used across the app's other "how it works"
// pages. Public, unauthenticated — linked from the site footer.
export default async function ExpressShowcasePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Express");

  return (
    <div className="mx-auto max-w-4xl space-y-16 px-4 py-10">
      <HowHero
        icon={Zap}
        tone="amber"
        title={t("heroTitle")}
        subtitle={t("heroSubtitle")}
      />

      {/* Tiers */}
      <section className="space-y-6">
        <div>
          <p className="text-primary text-xs font-semibold tracking-wide uppercase">
            {t("tiersEyebrow")}
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
            {t("tiersTitle")}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm text-pretty">
            {t("tiersSubtitle")}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              icon: Package,
              name: "t1Name",
              tag: "t1Tag",
              eta: "t1Eta",
              desc: "t1Desc",
            },
            {
              icon: Zap,
              name: "t2Name",
              tag: "t2Tag",
              eta: "t2Eta",
              desc: "t2Desc",
              accent: true,
            },
            {
              icon: Store,
              name: "t3Name",
              tag: "t3Tag",
              eta: "t3Eta",
              desc: "t3Desc",
            },
          ].map((tier) => (
            <div
              key={tier.name}
              className={
                tier.accent
                  ? "border-primary/40 bg-primary/5 rounded-xl border p-4"
                  : "rounded-xl border p-4"
              }
            >
              <div className="flex items-center gap-2">
                <tier.icon
                  className={
                    tier.accent
                      ? "text-primary size-4"
                      : "text-muted-foreground size-4"
                  }
                />
                <span className="font-semibold">{t(tier.name)}</span>
                <span className="bg-background/70 text-muted-foreground ms-auto rounded-full border px-2 py-0.5 text-[11px] font-medium">
                  {t(tier.tag)}
                </span>
              </div>
              <p
                className="text-muted-foreground mt-2 font-mono text-xs"
                dir="ltr"
              >
                {t(tier.eta)}
              </p>
              <p className="mt-2 text-sm">{t(tier.desc)}</p>
            </div>
          ))}
        </div>

        <PhoneShot
          src="/express/checkout-tiers.png"
          width={430}
          height={1310}
          alt={t("t2Name")}
          caption={t("shotCheckout")}
        />
      </section>

      {/* The journey */}
      <section className="space-y-6">
        <div>
          <p className="text-primary text-xs font-semibold tracking-wide uppercase">
            {t("journeyEyebrow")}
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
            {t("journeyTitle")}
          </h2>
        </div>

        <HowFlow
          steps={[
            { icon: ShoppingBag, tone: "sky", title: t("s1t"), text: t("s1d") },
            { icon: Truck, tone: "violet", title: t("s2t"), text: t("s2d") },
            { icon: Zap, tone: "amber", title: t("s3t"), text: t("s3d") },
            { icon: QrCode, tone: "rose", title: t("s4t"), text: t("s4d") },
            { icon: Repeat, tone: "slate", title: t("s5t"), text: t("s5d") },
            { icon: Wallet, tone: "emerald", title: t("s6t"), text: t("s6d") },
          ]}
        />

        <div className="grid gap-8 sm:grid-cols-2">
          <PhoneShot
            src="/express/seller-ship.png"
            width={430}
            height={1293}
            alt={t("s2t")}
            caption={t("shotShip")}
          />
          <PhoneShot
            src="/express/shipping-label.png"
            width={430}
            height={545}
            alt={t("s2t")}
            caption={t("shotLabel")}
          />
          <PhoneShot
            src="/express/driver-offers.png"
            width={430}
            height={848}
            alt={t("s3t")}
            caption={t("shotOffers")}
          />
          <PhoneShot
            src="/express/driver-job.png"
            width={430}
            height={872}
            alt={t("s4t")}
            caption={t("shotJob")}
          />
          <PhoneShot
            src="/express/driver-proof.png"
            width={430}
            height={1400}
            alt={t("s4t")}
            caption={t("shotProof")}
          />
          <PhoneShot
            src="/express/tracking.png"
            width={430}
            height={1090}
            alt={t("s6t")}
            caption={t("shotTracking")}
          />
        </div>
      </section>

      {/* Dispatch */}
      <section className="space-y-6">
        <div>
          <p className="text-primary text-xs font-semibold tracking-wide uppercase">
            {t("dispatchEyebrow")}
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
            {t("dispatchTitle")}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm text-pretty">
            {t("dispatchSubtitle")}
          </p>
        </div>

        <DesktopShot
          src="/express/admin-dispatch.png"
          width={1280}
          height={720}
          alt={t("dispatchTitle")}
          caption={t("shotDispatch")}
        />

        <HowGrid
          items={[
            { icon: Bell, tone: "sky", title: t("d1t"), text: t("d1d") },
            {
              icon: LayoutGrid,
              tone: "violet",
              title: t("d2t"),
              text: t("d2d"),
            },
            { icon: Radar, tone: "amber", title: t("d3t"), text: t("d3d") },
            { icon: Truck, tone: "emerald", title: t("d4t"), text: t("d4d") },
            { icon: Clock3, tone: "rose", title: t("d5t"), text: t("d5d") },
            {
              icon: ShieldCheck,
              tone: "slate",
              title: t("d6t"),
              text: t("d6d"),
            },
          ]}
        />
      </section>

      {/* Hezalli Points */}
      <section className="space-y-6">
        <div>
          <p className="text-primary text-xs font-semibold tracking-wide uppercase">
            {t("pointsEyebrow")}
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
            {t("pointsTitle")}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm text-pretty">
            {t("pointsSubtitle")}
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          <PhoneShot
            src="/express/point-scan.png"
            width={430}
            height={387}
            alt={t("p1t")}
            caption={t("shotPointScan")}
          />
          <PhoneShot
            src="/express/point-parcels.png"
            width={430}
            height={304}
            alt={t("p1t")}
            caption={t("shotPointParcels")}
          />
        </div>

        <HowGrid
          items={[
            { icon: ScanLine, tone: "sky", title: t("p1t"), text: t("p1d") },
            { icon: HandCoins, tone: "amber", title: t("p2t"), text: t("p2d") },
          ]}
        />
      </section>

      {/* Driver onboarding */}
      <section className="space-y-6">
        <div>
          <p className="text-primary text-xs font-semibold tracking-wide uppercase">
            {t("onboardEyebrow")}
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
            {t("onboardTitle")}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm text-pretty">
            {t("onboardSubtitle")}
          </p>
        </div>

        <HowFlow
          steps={[
            { icon: UserCheck, tone: "sky", title: t("o1t"), text: t("o1d") },
            {
              icon: ShieldCheck,
              tone: "violet",
              title: t("o2t"),
              text: t("o2d"),
            },
            { icon: Bike, tone: "emerald", title: t("o3t"), text: t("o3d") },
          ]}
        />
      </section>

      {/* Tracking + SLA */}
      <section className="space-y-6">
        <div>
          <p className="text-primary text-xs font-semibold tracking-wide uppercase">
            {t("trackEyebrow")}
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
            {t("trackTitle")}
          </h2>
        </div>

        <HowGrid
          items={[
            { icon: MapPinned, tone: "sky", title: t("tr1t"), text: t("tr1d") },
            { icon: Clock3, tone: "rose", title: t("tr2t"), text: t("tr2d") },
          ]}
        />
      </section>

      {/* Operational depth */}
      <section className="space-y-6">
        <div>
          <p className="text-primary text-xs font-semibold tracking-wide uppercase">
            {t("depthEyebrow")}
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
            {t("depthTitle")}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm text-pretty">
            {t("depthSubtitle")}
          </p>
        </div>

        <HowGrid
          items={[
            { icon: Camera, tone: "rose", title: t("g1t"), text: t("g1d") },
            { icon: Wallet, tone: "amber", title: t("g2t"), text: t("g2d") },
            { icon: Star, tone: "violet", title: t("g3t"), text: t("g3d") },
            { icon: MapPinned, tone: "sky", title: t("g4t"), text: t("g4d") },
            {
              icon: PackageCheck,
              tone: "emerald",
              title: t("g5t"),
              text: t("g5d"),
            },
            { icon: Settings2, tone: "slate", title: t("g6t"), text: t("g6d") },
          ]}
        />
      </section>

      {/* Config reference */}
      <section className="space-y-6">
        <div>
          <p className="text-primary text-xs font-semibold tracking-wide uppercase">
            {t("configEyebrow")}
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
            {t("configTitle")}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("configSubtitle")}
          </p>
        </div>

        <ConfigTable
          colSetting={t("colSetting")}
          colDefault={t("colDefault")}
          colDesc={t("colDesc")}
          groups={[
            {
              label: t("grp1"),
              rows: [
                { key: t("c1k"), value: t("c1v"), desc: t("c1d") },
                { key: t("c2k"), value: t("c2v"), desc: t("c2d") },
                { key: t("c3k"), value: t("c3v"), desc: t("c3d") },
              ],
            },
            {
              label: t("grp2"),
              rows: [
                { key: t("c4k"), value: t("c4v"), desc: t("c4d") },
                { key: t("c5k"), value: t("c5v"), desc: t("c5d") },
                { key: t("c6k"), value: t("c6v"), desc: t("c6d") },
                { key: t("c7k"), value: t("c7v"), desc: t("c7d") },
              ],
            },
            {
              label: t("grp3"),
              rows: [
                { key: t("c8k"), value: t("c8v"), desc: t("c8d") },
                { key: t("c9k"), value: t("c9v"), desc: t("c9d") },
              ],
            },
            {
              label: t("grp4"),
              rows: [
                { key: t("c10k"), value: t("c10v"), desc: t("c10d") },
                { key: t("c11k"), value: t("c11v"), desc: t("c11d") },
                { key: t("c12k"), value: t("c12v"), desc: t("c12d") },
              ],
            },
          ]}
        />
      </section>

      {/* Roadmap */}
      <section className="space-y-6">
        <div>
          <p className="text-primary text-xs font-semibold tracking-wide uppercase">
            {t("roadmapEyebrow")}
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
            {t("roadmapTitle")}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm text-pretty">
            {t("roadmapSubtitle")}
          </p>
        </div>

        <RoadmapGrid
          items={[
            {
              status: t("r1status"),
              title: t("r1t"),
              text: t("r1d"),
              tone: "next",
            },
            {
              status: t("r2status"),
              title: t("r2t"),
              text: t("r2d"),
              tone: "planned",
            },
            {
              status: t("r3status"),
              title: t("r3t"),
              text: t("r3d"),
              tone: "planned",
            },
            {
              status: t("r4status"),
              title: t("r4t"),
              text: t("r4d"),
              tone: "live",
            },
          ]}
        />
      </section>

      <p className="text-muted-foreground border-t pt-6 text-center text-xs">
        {t("footerNote")}
      </p>
    </div>
  );
}
