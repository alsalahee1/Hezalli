import { getLocale, getTranslations } from "next-intl/server";

import { getRequestDisplayCurrency } from "@/lib/currency";
import { getListing } from "@/lib/search";
import { ProductListingView } from "@/components/shop/product-listing-view";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("Search");
  const result = await getListing(sp, locale, {
    display: await getRequestDisplayCurrency(),
  });
  const q = result.params.q;
  const heading = q ? t("resultsFor", { query: q }) : t("allProducts");

  return (
    <ProductListingView
      result={result}
      mode="search"
      locale={locale}
      heading={heading}
    />
  );
}
