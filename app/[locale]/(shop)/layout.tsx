import { Wrench } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { getAnnouncement } from "@/lib/actions/announcement";
import { getServerCartData } from "@/lib/cart";
import { toNavCategories } from "@/lib/categories";
import { getDisplayCurrency } from "@/lib/currency";
import { selectableZoneOf } from "@/lib/currency-constants";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { getTheme } from "@/lib/theme";
import type { Locale } from "@/i18n/routing";
import { CartProvider } from "@/components/cart/cart-provider";
import { CurrencyProvider } from "@/components/currency/currency-provider";
import { AnnouncementBanner } from "@/components/layout/announcement-banner";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const locale = await getLocale();
  const initialCart = session?.user?.id
    ? await getServerCartData(session.user.id, locale)
    : { cart: [], saved: [] };

  // Read the header identity from the DB so profile edits (name, and later the
  // avatar) show up immediately, rather than staying stale until the next login.
  const [user, catRows, wishlistCount] = await Promise.all([
    session?.user?.id
      ? prisma.user.findUnique({
          where: { id: session.user.id },
          select: {
            name: true,
            email: true,
            image: true,
            roles: true,
            wallet: { select: { availableUsd: true } },
            ownedFleet: { select: { isActive: true } },
            deliveryPoints: {
              where: { status: "ACTIVE" },
              select: { id: true },
              take: 1,
            },
            merchantProfile: { select: { status: true } },
          },
        })
      : Promise.resolve(null),
    prisma.category.findMany({
      where: { parentId: null, isActive: true },
      orderBy: { position: "asc" },
      select: {
        slug: true,
        name: true,
        icon: true,
        children: {
          where: { isActive: true },
          orderBy: { position: "asc" },
          select: { slug: true, name: true },
        },
      },
    }),
    session?.user?.id
      ? prisma.wishlistItem.count({
          where: { wishlist: { userId: session.user.id } },
        })
      : Promise.resolve(0),
  ]);

  const categories = toNavCategories(catRows, locale as Locale);
  const announcement = await getAnnouncement();
  const theme = await getTheme();
  const displayCurrency = await getDisplayCurrency(session?.user?.id);

  // Maintenance mode: the storefront is closed to everyone except admins, who
  // keep full access so they can verify the site before reopening it.
  const isAdmin = user?.roles.includes("ADMIN") ?? false;
  if ((await getSetting("maintenance_mode")) && !isAdmin) {
    const mt = await getTranslations("Maintenance");
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <Wrench className="text-muted-foreground size-10" />
        <h1 className="text-2xl font-semibold tracking-tight">{mt("title")}</h1>
        <p className="text-muted-foreground max-w-md">{mt("desc")}</p>
      </div>
    );
  }

  return (
    <CurrencyProvider value={displayCurrency}>
      <CartProvider isAuthed={Boolean(session?.user?.id)} initial={initialCart}>
        <div className="flex min-h-screen flex-col">
          {announcement.active && announcement.text ? (
            <AnnouncementBanner text={announcement.text} />
          ) : null}
          <SiteHeader
            user={
              user
                ? { name: user.name, email: user.email, image: user.image }
                : null
            }
            isSeller={user?.roles.includes("SELLER") ?? false}
            isAdmin={isAdmin}
            isCourier={user?.roles.includes("COURIER") ?? false}
            isPointOperator={
              (user?.roles.includes("DELIVERY_POINT") &&
                (user?.deliveryPoints.length ?? 0) > 0) ??
              false
            }
            isFleetOwner={user?.ownedFleet?.isActive ?? false}
            isMerchant={
              (user?.roles.includes("MERCHANT") &&
                user?.merchantProfile?.status === "ACTIVE") ??
              false
            }
            walletBalance={Number(user?.wallet?.availableUsd ?? 0)}
            categories={categories}
            theme={theme}
            displayCurrency={displayCurrency.code}
            displayZone={selectableZoneOf(displayCurrency.zone)}
          />
          <div className="flex-1">{children}</div>
          <SiteFooter />
          {/* Reserve room so the fixed bottom tab bar never covers footer content
            on phones; the extra space collapses at `md` where the bar hides. */}
          <div
            className="h-16 md:hidden"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            aria-hidden
          />
          {/* The AI assistant is mounted globally in the locale layout. */}
          <MobileTabBar wishlistCount={wishlistCount} />
        </div>
      </CartProvider>
    </CurrencyProvider>
  );
}
