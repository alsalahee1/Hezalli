import { getLocale, getTranslations } from "next-intl/server";
import { ShoppingBag, Store, Wallet } from "lucide-react";

import type { Metadata, Viewport } from "next";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { redirect, Link } from "@/i18n/navigation";

import { Forbidden } from "@/components/auth/forbidden";
import { MerchantTabBar } from "@/components/merchant/merchant-tab-bar";

// Scope the installable-app metadata to the merchant section (same pattern as
// the point/driver apps) so a shop can pin "Hezalli Merchant" to the counter
// phone or tablet.
export const metadata: Metadata = {
  title: "Hezalli Merchant",
  appleWebApp: {
    capable: true,
    title: "Hezalli Merchant",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

// Phone/counter-first shell for a HezalliPay merchant: the MERCHANT operator
// owning an ACTIVE MerchantProfile, checked against the DB. Gated behind the
// merchant_payments_enabled setting like the rest of the flow.
export default async function MerchantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) redirect({ href: "/login", locale });

  // Whole feature is licensed-gated; if it's off, no one gets the app.
  if (!(await getSetting("merchant_payments_enabled"))) return <Forbidden />;

  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: {
      roles: true,
      isSuspended: true,
      deletedAt: true,
      merchantProfile: { select: { status: true, businessName: true } },
    },
  });
  if (!user || user.deletedAt) redirect({ href: "/login", locale });
  if (user!.isSuspended) return <Forbidden />;

  const profile = user!.merchantProfile;
  if (!user!.roles.includes("MERCHANT") || !profile) {
    // Not a merchant → send them to apply rather than bounce to the shop.
    redirect({ href: "/merchant-apply", locale });
    return null;
  }
  // Role kept but the profile was suspended → access paused.
  if (profile.status !== "ACTIVE") return <Forbidden />;

  const t = await getTranslations("Merchant");

  return (
    <div className="bg-background mx-auto flex min-h-screen max-w-md flex-col md:max-w-2xl">
      <header className="bg-background/95 sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3 backdrop-blur print:hidden">
        <Link
          href="/merchant"
          className="flex items-center gap-2 font-semibold"
        >
          <Store className="text-primary size-5" /> {t("appName")}
        </Link>
        <div className="flex items-center gap-2">
          {/* Escape hatch back to the storefront — the merchant app is a
              standalone shell, so without this the operator has no way back. */}
          <Link
            href="/"
            aria-label={t("storefront")}
            title={t("storefront")}
            className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-9 items-center justify-center rounded-full transition-colors"
          >
            <ShoppingBag className="size-5" />
          </Link>
          {/* The merchant's takings live in their marketplace HezalliPay wallet
              (where transfers land) — one tap away. */}
          <Link
            href="/account/wallet"
            aria-label={t("wallet")}
            title={t("wallet")}
            className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-9 items-center justify-center rounded-full transition-colors"
          >
            <Wallet className="size-5" />
          </Link>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-24 print:p-0 print:pb-0">
        {children}
      </main>

      <div className="print:hidden">
        <MerchantTabBar />
      </div>
    </div>
  );
}
