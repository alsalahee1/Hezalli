import { getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CsvImport } from "@/components/seller/csv-import";
import { SellerToolsForm } from "@/components/seller/seller-tools";

export const dynamic = "force-dynamic";

export default async function SellerToolsPage() {
  const session = await auth();
  if (!session?.user?.id) return null; // layout redirects unauthenticated users

  const profile = await prisma.sellerProfile.findUnique({
    where: { userId: session.user.id },
    include: { store: true },
  });
  const store = profile?.store;
  if (!store) return null;

  const t = await getTranslations("SellerTools");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>

      <SellerToolsForm
        isOnVacation={store.isOnVacation}
        vacationMessage={store.vacationMessage ?? ""}
        autoReplyMessage={store.autoReplyMessage ?? ""}
      />

      <CsvImport />
    </div>
  );
}
