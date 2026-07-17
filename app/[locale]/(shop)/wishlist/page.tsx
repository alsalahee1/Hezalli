import { setRequestLocale } from "next-intl/server";

import { ComingSoon } from "@/components/coming-soon";

// Placeholder — the wishlist is built in Phase 7 (Cart & wishlist).
export default async function WishlistPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ComingSoon ns="Header" titleKey="wishlist" />;
}
