import { getTranslations, setRequestLocale } from "next-intl/server";

import { localizedName } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");

  const categories = await prisma.category.findMany({
    where: { parentId: null, isActive: true },
    orderBy: { position: "asc" },
    select: { slug: true, name: true, icon: true },
  });

  return (
    <main className="mx-auto max-w-7xl px-4">
      <section className="flex flex-col items-center gap-6 py-16 text-center sm:py-24">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          {t("heroTitle")}
        </h1>
        <p className="text-muted-foreground max-w-xl text-pretty">
          {t("heroSubtitle")}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="#categories">{t("shopNow")}</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="#categories">{t("browseCategories")}</Link>
          </Button>
        </div>
      </section>

      {categories.length > 0 ? (
        <section id="categories" className="pb-16">
          <h2 className="mb-6 text-2xl font-semibold tracking-tight">
            {t("categoriesTitle")}
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {categories.map((c) => (
              <Link
                key={c.slug}
                href={`/c/${c.slug}`}
                className="bg-card text-card-foreground hover:border-foreground/30 hover:bg-muted flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border p-4 text-center transition-colors"
              >
                {c.icon ? (
                  <span className="text-2xl" aria-hidden>
                    {c.icon}
                  </span>
                ) : null}
                <span className="text-sm font-medium">
                  {localizedName(c.name, locale)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
