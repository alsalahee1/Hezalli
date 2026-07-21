import type { Metadata } from "next";
import { MapPin, Phone, Store } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { publicPointsByGovernorate } from "@/lib/point-public";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("PointsDirectory");
  return { title: t("title"), description: t("subtitle") };
}

// Public directory of Hezalli Points (docs §24): where buyers can collect
// pickup orders and sellers can drop parcels. Shows only shopfront info —
// name, address, phone — grouped by governorate.
export default async function PointsDirectoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("PointsDirectory");
  const groups = await publicPointsByGovernorate();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground mx-auto max-w-xl text-pretty">
          {t("subtitle")}
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="text-muted-foreground mt-10 rounded-xl border border-dashed py-16 text-center text-sm">
          {t("empty")}
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {groups.map((g) => (
            <section key={g.governorate}>
              <h2 className="mb-3 flex items-center gap-1.5 text-lg font-semibold">
                <MapPin className="text-primary size-4" /> {g.governorate}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {g.points.map((p) => (
                  <li key={p.id} className="rounded-xl border p-4">
                    <p className="flex items-center gap-1.5 font-medium">
                      <Store className="text-muted-foreground size-4 shrink-0" />
                      {p.name}
                    </p>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {p.addressLine}, {p.city}
                    </p>
                    <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
                      <Phone className="size-3.5 shrink-0" />
                      <span dir="ltr">{p.phone}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="text-muted-foreground mt-10 text-center text-sm">
        {t("becomeHint")}{" "}
        <Link
          href="/point-partner"
          className="text-primary font-medium hover:underline"
        >
          {t("becomeLink")}
        </Link>
      </p>
    </main>
  );
}
