import { ExternalLink } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { StorePolicies } from "@/lib/validations/store";
import { Link } from "@/i18n/navigation";
import { StoreSettingsForm } from "@/components/seller/store-settings-form";

export default async function SellerSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) return null; // layout redirects unauthenticated users

  const profile = await prisma.sellerProfile.findUnique({
    where: { userId: session.user.id },
    select: { store: true },
  });
  const store = profile?.store;
  if (!store) return null; // layout redirects non-sellers to /sell

  const t = await getTranslations("SellerSettings");
  const policies = (store.policies ?? {}) as StorePolicies;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("desc")}</p>
        </div>
        <Link
          href={`/store/${store.slug}`}
          className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
        >
          {t("viewStore")}
          <ExternalLink className="size-3.5" />
        </Link>
      </div>

      <StoreSettingsForm
        store={{
          name: store.name,
          slug: store.slug,
          description: store.description ?? "",
          returnPolicy: policies.returnPolicy ?? "",
          shippingPolicy: policies.shippingPolicy ?? "",
          contact: policies.contact ?? "",
        }}
      />
    </div>
  );
}
