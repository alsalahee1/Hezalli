import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { requireMerchant } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/finance";
import { abs } from "@/lib/seo";
import { QrCode } from "@/components/orders/qr-code";
import { ChargeAmountForm } from "@/components/merchant/charge-amount-form";
import { CopyPayLinkButton } from "@/components/merchant/copy-pay-link-button";

// The counter "charge" screen: the cashier enters an amount, and the shop shows
// a QR (and shareable link) the customer scans to pay that exact amount from
// their HezalliPay balance. Reuses the same /pay/m/[slug] surface as the static
// store QR, just with the amount prefilled.
export default async function MerchantChargePage({
  searchParams,
}: {
  searchParams: Promise<{ amount?: string; note?: string }>;
}) {
  const gate = await requireMerchant();
  if (!gate) return null;
  const t = await getTranslations("Merchant");
  const locale = await getLocale();
  const format = await getFormatter();

  const profile = await prisma.merchantProfile.findUnique({
    where: { id: gate.merchantId },
    select: { slug: true, businessName: true },
  });
  if (!profile) return null;

  const sp = await searchParams;
  const n = Number(sp.amount);
  const amount = Number.isFinite(n) && n > 0 ? round2(n) : null;
  const note = sp.note?.trim() || "";

  // Build the customer pay URL. When an amount is set it's prefilled + locked on
  // the pay page; the note rides along as context (e.g. "Table 5").
  const params = new URLSearchParams();
  if (amount != null) params.set("amount", String(amount));
  if (note) params.set("note", note);
  const query = params.toString();
  const payUrl = abs(
    locale,
    `/pay/m/${profile.slug}${query ? `?${query}` : ""}`,
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">{t("chargeTitle")}</h1>
        <p className="text-muted-foreground text-sm">{t("chargeSubtitle")}</p>
      </div>

      <ChargeAmountForm
        initialAmount={amount != null ? String(amount) : ""}
        initialNote={note}
        hasCharge={amount != null}
      />

      {amount != null ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border p-5 text-center">
          <p className="text-3xl font-bold" dir="ltr">
            {format.number(amount, { style: "currency", currency: "USD" })}
          </p>
          {note ? (
            <p className="text-muted-foreground text-sm">{note}</p>
          ) : null}
          <div className="rounded-lg bg-white p-3">
            <QrCode value={payUrl} size={220} />
          </div>
          <p className="text-muted-foreground text-xs">{t("chargeScanHint")}</p>
          <div className="w-full">
            <CopyPayLinkButton url={payUrl} />
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground rounded-xl border border-dashed py-10 text-center text-sm">
          {t("chargeEmptyHint")}
        </p>
      )}
    </div>
  );
}
