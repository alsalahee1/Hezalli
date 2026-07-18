import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { getAnnouncement } from "@/lib/actions/announcement";
import { getServerCartData } from "@/lib/cart";
import { toNavCategories } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/routing";
import { CartProvider } from "@/components/cart/cart-provider";
import { AnnouncementBanner } from "@/components/layout/announcement-banner";
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
  const [user, catRows] = await Promise.all([
    session?.user?.id
      ? prisma.user.findUnique({
          where: { id: session.user.id },
          select: { name: true, email: true, image: true, roles: true },
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
  ]);

  const categories = toNavCategories(catRows, locale as Locale);
  const announcement = await getAnnouncement();

  return (
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
          categories={categories}
        />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </div>
    </CartProvider>
  );
}
