import { getLocale, getTranslations } from "next-intl/server";
import { Truck } from "lucide-react";

import type { Metadata } from "next";

import { requireFleetOwner } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { redirect, Link } from "@/i18n/navigation";

export const metadata: Metadata = {
  title: "Hezalli Fleet",
};

// Read-only partner shell for a fleet owner. Gated to a user who owns an ACTIVE
// fleet (ownership is the grant — no dedicated role).
export default async function FleetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const owner = await requireFleetOwner();
  if (!owner) redirect({ href: "/", locale });

  const fleet = await prisma.fleet.findUnique({
    where: { id: owner!.fleetId },
    select: { name: true },
  });
  const t = await getTranslations("Fleet");

  return (
    <div className="bg-background mx-auto flex min-h-screen max-w-3xl flex-col">
      <header className="bg-background/95 sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3 backdrop-blur">
        <Link href="/fleet" className="flex items-center gap-2 font-semibold">
          <Truck className="text-primary size-5" />{" "}
          {fleet?.name ?? t("appName")}
        </Link>
      </header>
      <main className="flex-1 px-4 py-4">{children}</main>
    </div>
  );
}
