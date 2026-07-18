import { getTranslations } from "next-intl/server";

import { CartView } from "@/components/cart/cart-view";

export default async function CartPage() {
  const t = await getTranslations("Cart");
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">
        {t("title")}
      </h1>
      <CartView />
    </main>
  );
}
