import { getLocale, getTranslations } from "next-intl/server";
import { ShoppingBag, Store, Wallet } from "lucide-react";

import type { Metadata, Viewport } from "next";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect, Link } from "@/i18n/navigation";
import { Forbidden } from "@/components/auth/forbidden";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { PointTabBar } from "@/components/point/point-tab-bar";
import type { PointAccess } from "@/lib/point-access";

// Scope the installable-app metadata to the point section only (same pattern
// as the driver app) so operators can pin "Hezalli Point" to a phone or the
// shop counter tablet.
export const metadata: Metadata = {
  title: "Hezalli Point",
  appleWebApp: {
    capable: true,
    title: "Hezalli Point",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

// Phone/counter-first shell for everyone working at a Hezalli Point: the
// DELIVERY_POINT operator owning an ACTIVE point, or an active PointStaff
// member of one (docs §42d) — both checked against the DB. The resolved
// access tier drives which tabs the shell shows.
export default async function PointLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) redirect({ href: "/login", locale });

  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: {
      roles: true,
      isSuspended: true,
      deletedAt: true,
      deliveryPoint: { select: { status: true } },
      pointStaff: {
        select: {
          role: true,
          isActive: true,
          point: { select: { status: true } },
        },
      },
    },
  });
  if (!user || user.deletedAt) redirect({ href: "/login", locale });
  if (user!.isSuspended) return <Forbidden />;

  const staff = user!.pointStaff;
  let access: PointAccess;
  if (user!.roles.includes("DELIVERY_POINT")) {
    // Suspended point: role kept, access paused.
    if (user!.deliveryPoint?.status !== "ACTIVE") return <Forbidden />;
    access = "OWNER";
  } else if (staff) {
    // Deactivated membership or suspended hub: keep the row, pause access.
    if (!staff.isActive || staff.point.status !== "ACTIVE") {
      return <Forbidden />;
    }
    access = staff.role;
  } else {
    // Not an operator or employee → send them to apply rather than bounce
    // to the shop.
    redirect({ href: "/point-partner", locale });
    return null;
  }

  const t = await getTranslations("Point");

  return (
    <div className="bg-background mx-auto flex min-h-screen max-w-md flex-col">
      <header className="bg-background/95 sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3 backdrop-blur print:hidden">
        <Link href="/point" className="flex items-center gap-2 font-semibold">
          <Store className="text-primary size-5" /> {t("appName")}
        </Link>
        <div className="flex items-center gap-2">
          {/* Escape hatch back to the storefront — the point app is a
              standalone shell, so without this an operator who opens it has no
              way back to the shop (matches the driver/seller/admin shells). */}
          <Link
            href="/"
            aria-label={t("storefront")}
            title={t("storefront")}
            className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-9 items-center justify-center rounded-full transition-colors"
          >
            <ShoppingBag className="size-5" />
          </Link>
          {/* Quick hop to the marketplace wallet (USD balance), separate from
              the point cash ledger in the bottom bar. */}
          <Link
            href="/account/wallet"
            aria-label={t("wallet")}
            title={t("wallet")}
            className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-9 items-center justify-center rounded-full transition-colors"
          >
            <Wallet className="size-5" />
          </Link>
          {/* Sweep alerts (stale parcel, pickup expiry) land here — without
              the bell the operator would never see them inside this shell. */}
          <NotificationBell variant="point" />
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-20 print:p-0 print:pb-0">
        {children}
      </main>

      <div className="print:hidden">
        <PointTabBar access={access} />
      </div>
    </div>
  );
}
