import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { toNavCategories } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/routing";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const locale = await getLocale();

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

  return (
    <div className="flex min-h-screen flex-col">
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
  );
}
