import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  // Read the header identity from the DB so profile edits (name, and later the
  // avatar) show up immediately, rather than staying stale until the next login.
  const user = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true, email: true, image: true },
      })
    : null;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader user={user} />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
