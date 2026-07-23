import { getLocale, getTranslations } from "next-intl/server";
import { BookOpen, Store, Truck, Wallet } from "lucide-react";

import type { Metadata, Viewport } from "next";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect, Link } from "@/i18n/navigation";
import { Forbidden } from "@/components/auth/forbidden";
import { DriverTabBar } from "@/components/driver/driver-tab-bar";

// Scope the installable-app metadata to the driver section only, so the driver
// app can be added to a phone's home screen and run standalone (native feel)
// without turning the whole marketplace into "Hezalli Driver".
export const metadata: Metadata = {
  title: "Hezalli Driver",
  manifest: "/driver.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Hezalli Driver",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

// Phone-first shell for Hezalli Express drivers. Gated to the COURIER role
// (checked against the DB, not the JWT). Deliberately minimal chrome so it
// feels like a dedicated delivery app when installed to the home screen.
export default async function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) redirect({ href: "/login", locale });

  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { roles: true, isSuspended: true, deletedAt: true },
  });
  if (!user || user.deletedAt) redirect({ href: "/login", locale });
  if (user!.isSuspended) return <Forbidden />;
  // Not a driver yet → send them to apply rather than bounce to the storefront.
  if (!user!.roles.includes("COURIER")) redirect({ href: "/drive", locale });

  const t = await getTranslations("Driver");

  return (
    <div className="bg-background mx-auto flex min-h-screen max-w-md flex-col">
      <header className="bg-background/95 sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3 backdrop-blur">
        <Link href="/driver" className="flex items-center gap-2 font-semibold">
          <Truck className="text-primary size-5" /> {t("appName")}
        </Link>
        <div className="flex items-center gap-2">
          {/* Escape hatch back to the storefront — the driver app is a
              standalone shell, so without this a courier who opens it has no
              way back to the shop (the seller/admin shells link out the same
              way). */}
          <Link
            href="/"
            aria-label={t("storefront")}
            title={t("storefront")}
            className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-9 items-center justify-center rounded-full transition-colors"
          >
            <Store className="size-5" />
          </Link>
          {/* Quick hop to the marketplace wallet (USD balance), separate from
              the courier cash ledger in the bottom bar. */}
          <Link
            href="/account/wallet"
            aria-label={t("wallet")}
            title={t("wallet")}
            className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-9 items-center justify-center rounded-full transition-colors"
          >
            <Wallet className="size-5" />
          </Link>
          {/* How-it-works moved off the bottom bar (kept to 5 tabs) — the driver
              guide is reference material, so it lives with the other utility
              links up here. */}
          <Link
            href="/driver/how"
            aria-label={t("how")}
            title={t("how")}
            className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-9 items-center justify-center rounded-full transition-colors"
          >
            <BookOpen className="size-5" />
          </Link>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-20">{children}</main>

      <DriverTabBar />
    </div>
  );
}
