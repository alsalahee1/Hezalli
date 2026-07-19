import { getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AddressBook } from "@/components/account/address-book";

export default async function AddressesPage() {
  const session = await auth();
  if (!session?.user?.id) return null; // layout redirects unauthenticated users

  const addresses = await prisma.address.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  const t = await getTranslations("Account");

  // Plain objects for the client component.
  const plain = addresses.map((a) => ({
    id: a.id,
    fullName: a.fullName,
    phone: a.phone,
    governorate: a.governorate,
    city: a.city,
    line1: a.line1,
    line2: a.line2,
    notes: a.notes,
    lat: a.lat,
    lng: a.lng,
    isDefault: a.isDefault,
  }));

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("addressesTitle")}</h2>
        <p className="text-muted-foreground text-sm">{t("addressesDesc")}</p>
      </div>
      <AddressBook addresses={plain} />
    </section>
  );
}
