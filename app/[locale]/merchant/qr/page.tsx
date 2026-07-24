import { getLocale, getTranslations } from "next-intl/server";
import { Store } from "lucide-react";

import { requireMerchant } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { abs } from "@/lib/seo";
import { QrCode } from "@/components/orders/qr-code";
import { CopyPayLinkButton } from "@/components/merchant/copy-pay-link-button";

// The shop's permanent "pay us" QR — print it and stick it at the counter. It
// opens /pay/m/[slug] with no amount, so the customer types what they owe. For
// a fixed amount, use the Charge screen instead.
export default async function MerchantStoreQrPage() {
  const gate = await requireMerchant();
  if (!gate) return null;
  const t = await getTranslations("Merchant");
  const locale = await getLocale();

  const profile = await prisma.merchantProfile.findUnique({
    where: { id: gate.merchantId },
    select: { slug: true, businessName: true, city: true },
  });
  if (!profile) return null;

  const payUrl = abs(locale, `/pay/m/${profile.slug}`);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">{t("storeQrTitle")}</h1>
        <p className="text-muted-foreground text-sm">{t("storeQrSubtitle")}</p>
      </div>

      {/* The printable card. print:* utilities strip everything but this block
          so a counter print gives a clean sign. */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border p-6 text-center print:border-0 print:shadow-none">
        <span className="text-primary flex items-center gap-2 text-lg font-bold">
          <Store className="size-5" /> {profile.businessName}
        </span>
        <p className="text-muted-foreground text-sm">{t("storeQrPayWith")}</p>
        <div className="rounded-lg bg-white p-4">
          <QrCode value={payUrl} size={240} />
        </div>
        <p className="text-muted-foreground text-xs break-all" dir="ltr">
          {payUrl}
        </p>
      </div>

      <div className="print:hidden">
        <CopyPayLinkButton url={payUrl} />
      </div>
    </div>
  );
}
