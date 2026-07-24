import { getLocale, getTranslations } from "next-intl/server";

import { requireMerchant } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { localizedGovernorate } from "@/lib/yemen";
import { abs } from "@/lib/seo";

// Read-only merchant profile: the business details captured at onboarding plus
// the public pay link. Editing (and status) is admin-managed for now — see the
// admin merchants panel.
export default async function MerchantProfilePage() {
  const gate = await requireMerchant();
  if (!gate) return null;
  const t = await getTranslations("Merchant");
  const locale = await getLocale();

  const profile = await prisma.merchantProfile.findUnique({
    where: { id: gate.merchantId },
    select: {
      businessName: true,
      category: true,
      phone: true,
      governorate: true,
      city: true,
      slug: true,
      createdAt: true,
    },
  });
  if (!profile) return null;

  const payUrl = abs(locale, `/pay/m/${profile.slug}`);
  const rows: { label: string; value: string; dir?: "ltr" }[] = [
    { label: t("fieldBusiness"), value: profile.businessName },
    { label: t("fieldCategory"), value: t(`cat_${profile.category}`) },
    { label: t("fieldPhone"), value: profile.phone, dir: "ltr" },
    {
      label: t("fieldLocation"),
      value: `${profile.city}, ${localizedGovernorate(profile.governorate, locale)}`,
    },
    { label: t("fieldPayLink"), value: payUrl, dir: "ltr" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">{t("profileTitle")}</h1>

      <dl className="divide-y rounded-xl border">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-start justify-between gap-4 px-4 py-3"
          >
            <dt className="text-muted-foreground text-sm">{r.label}</dt>
            <dd
              className="max-w-[60%] text-end text-sm font-medium break-words"
              dir={r.dir}
            >
              {r.value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="text-muted-foreground text-xs">{t("profileEditHint")}</p>
    </div>
  );
}
