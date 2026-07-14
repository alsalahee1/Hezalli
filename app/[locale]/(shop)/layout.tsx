import { auth } from "@/auth";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader user={session?.user ?? null} />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
