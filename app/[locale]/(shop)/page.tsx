import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

const CATEGORIES = [
  { slug: "electronics", key: "electronics" },
  { slug: "phones-accessories", key: "phones" },
  { slug: "fashion-apparel", key: "fashion" },
  { slug: "home-kitchen", key: "home" },
  { slug: "health-beauty", key: "beauty" },
  { slug: "groceries-food", key: "groceries" },
  { slug: "baby-kids-toys", key: "baby" },
  { slug: "books-stationery", key: "books" },
  { slug: "sports-outdoors", key: "sports" },
  { slug: "automotive-tools", key: "automotive" },
] as const;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const cat = await getTranslations("Categories");

  return (
    <main className="mx-auto max-w-7xl px-4">
      <section className="flex flex-col items-center gap-6 py-16 text-center sm:py-24">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          {t("heroTitle")}
        </h1>
        <p className="max-w-xl text-pretty text-muted-foreground">
          {t("heroSubtitle")}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="/c/electronics">{t("shopNow")}</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="#categories">{t("browseCategories")}</Link>
          </Button>
        </div>
      </section>

      <section id="categories" className="pb-16">
        <h2 className="mb-6 text-2xl font-semibold tracking-tight">
          {t("categoriesTitle")}
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={`/c/${c.slug}`}
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border bg-card p-4 text-center text-card-foreground transition-colors hover:border-foreground/30 hover:bg-muted"
            >
              <span className="text-sm font-medium">{cat(c.key)}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
