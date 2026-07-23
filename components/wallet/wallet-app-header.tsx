import { getTranslations } from "next-intl/server";
import { ChevronLeft, LayoutDashboard, Store, Wallet } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { dashboardHref } from "@/lib/dashboard-href";
import { Link } from "@/i18n/navigation";

/**
 * Native app-style top bar for the wallet on phones. On mobile the storefront
 * chrome is hidden (globals.css [data-native-wallet]) so these screens would
 * otherwise open with no header — this stands in for it. `md:hidden` leaves the
 * desktop layout (storefront header + account nav) untouched; `-mx-4 -mt-3`
 * pulls it out past the account shell's padding so it reads as a real bar.
 *
 * Overview: brand on one side; on the other, quick hops to the user's own
 * dashboard and the storefront. Sub-screens: pass `backHref` to swap the exits
 * for a back arrow.
 */
export async function WalletAppHeader({ backHref }: { backHref?: string }) {
  const t = await getTranslations("Wallet");
  const tNav = await getTranslations("WalletNav");
  const q = await getTranslations("QuickNav");

  // Resolve where "my dashboard" lives for this user (seller center, admin
  // panel, driver app, …) so the wallet links back to it like every other
  // shell. Only needed on the overview bar — sub-screens just show "back".
  let dash = "/account";
  if (!backHref) {
    const session = await auth();
    if (session?.user?.id) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          roles: true,
          ownedFleet: { select: { isActive: true } },
          deliveryPoint: { select: { status: true } },
        },
      });
      dash = dashboardHref({
        isAdmin: user?.roles.includes("ADMIN"),
        isSeller: user?.roles.includes("SELLER"),
        isCourier: user?.roles.includes("COURIER"),
        isPointOperator:
          user?.roles.includes("DELIVERY_POINT") &&
          user?.deliveryPoint?.status === "ACTIVE",
        isFleetOwner: user?.ownedFleet?.isActive ?? false,
      });
    }
  }

  return (
    <header
      data-app-header
      className="bg-background/95 supports-[backdrop-filter]:bg-background/85 sticky top-0 z-30 -mx-4 -mt-3 flex items-center justify-between border-b px-4 py-3 backdrop-blur md:hidden"
    >
      <div className="flex items-center gap-1">
        {backHref ? (
          <Link
            href={backHref}
            aria-label={t("backToWallet")}
            className="text-muted-foreground hover:text-foreground hover:bg-muted -ms-2 inline-flex size-9 items-center justify-center rounded-full transition-colors"
          >
            <ChevronLeft className="size-5 rtl:rotate-180" />
          </Link>
        ) : null}
        <span className="flex items-center gap-2 font-semibold">
          <Wallet className="text-primary size-5" aria-hidden /> {t("appName")}
        </span>
      </div>
      {backHref ? null : (
        <div className="flex items-center gap-1">
          <Link
            href={dash}
            aria-label={q("dashboard")}
            title={q("dashboard")}
            className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-9 items-center justify-center rounded-full transition-colors"
          >
            <LayoutDashboard className="size-5" />
          </Link>
          <Link
            href="/"
            aria-label={tNav("exit")}
            title={tNav("exit")}
            className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-9 items-center justify-center rounded-full transition-colors"
          >
            <Store className="size-5" />
          </Link>
        </div>
      )}
    </header>
  );
}
