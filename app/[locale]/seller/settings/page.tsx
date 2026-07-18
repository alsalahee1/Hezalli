import { BadgeCheck, ExternalLink, Truck } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { StorePolicies } from "@/lib/validations/store";
import { Link } from "@/i18n/navigation";
import { PayoutForm, type PayoutData } from "@/components/seller/payout-form";
import { StoreSettingsForm } from "@/components/seller/store-settings-form";

export default async function SellerSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) return null; // layout redirects unauthenticated users

  const profile = await prisma.sellerProfile.findUnique({
    where: { userId: session.user.id },
    include: { store: true, payoutMethods: { where: { isDefault: true } } },
  });
  const store = profile?.store;
  if (!profile || !store) return null; // layout redirects non-sellers to /sell

  const t = await getTranslations("SellerSettings");
  const p = await getTranslations("Payout");
  const policies = (store.policies ?? {}) as StorePolicies;

  const method = profile.payoutMethods[0];
  const payout: PayoutData = method
    ? {
        kind: method.kind,
        details: (method.details ?? {}) as Record<string, string>,
      }
    : null;
  const verified = profile.kycStatus === "VERIFIED";

  return (
    <div className="space-y-10">
      <section className="space-y-6">
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
      </section>

      <section id="payout" className="space-y-4 border-t pt-8">
        <div>
          <h2 className="text-lg font-semibold">{p("title")}</h2>
          <p className="text-muted-foreground text-sm">{p("desc")}</p>
        </div>
        <p
          className={
            verified
              ? "inline-flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-3 py-2 text-sm text-emerald-600"
              : "bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm"
          }
        >
          {verified ? <BadgeCheck className="size-4" /> : null}
          {verified ? p("kycVerified") : p("kycPending")}
        </p>
        <PayoutForm current={payout} />
      </section>

      <section className="space-y-3 border-t pt-8">
        <div>
          <h2 className="text-lg font-semibold">{t("shippingTitle")}</h2>
          <p className="text-muted-foreground text-sm">{t("shippingDesc")}</p>
        </div>
        <Link
          href="/seller/settings/shipping"
          className="hover:border-muted-foreground/40 inline-flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium"
        >
          <Truck className="size-4" /> {t("shippingManage")}
        </Link>
      </section>
    </div>
  );
}
