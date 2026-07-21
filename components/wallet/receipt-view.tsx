import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { getSetting } from "@/lib/settings";
import { billerName } from "@/lib/wallet-billers";
import type { ReceiptData } from "@/lib/wallet-receipt";
import type { WalletEntryType } from "@/lib/generated/prisma/client";

// Wallet entry type → translation key for its human label.
const TYPE_LABEL: Record<WalletEntryType, string> = {
  TOP_UP: "topUp",
  PAYMENT: "payment",
  REFUND: "refund",
  CASHBACK: "cashback",
  CASHOUT: "cashout",
  ADJUSTMENT: "adjustment",
  SELLER_EARNINGS: "sellerEarnings",
  COURIER_EARNINGS: "courierEarnings",
  POINT_EARNINGS: "pointEarnings",
  TRANSFER_OUT: "transferOut",
  TRANSFER_IN: "transferIn",
  BILL_PAYMENT: "billPaymentEntry",
  AIRTIME_TOPUP: "airtimeEntry",
  BILL_REFUND: "billRefundEntry",
};

const STATUS_ICON = {
  completed: CheckCircle2,
  pending: Clock,
  failed: XCircle,
  cancelled: XCircle,
} as const;

const STATUS_COLOR = {
  completed: "text-emerald-600",
  pending: "text-amber-600",
  failed: "text-destructive",
  cancelled: "text-muted-foreground",
} as const;

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-end font-medium break-all">{children}</span>
    </div>
  );
}

// Pure, self-contained receipt card. Shows only this one transaction — never a
// balance or any other activity — so it is safe to render on the public page.
export async function ReceiptView({ receipt }: { receipt: ReceiptData }) {
  const t = await getTranslations("Wallet");
  const format = await getFormatter();
  const locale = await getLocale();
  const platform = await getSetting("platform_name");

  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });
  const StatusIcon = STATUS_ICON[receipt.status];
  const isBill =
    receipt.type === "BILL_PAYMENT" ||
    receipt.type === "AIRTIME_TOPUP" ||
    receipt.type === "BILL_REFUND";

  return (
    <div className="overflow-hidden rounded-xl border">
      {/* Header + amount */}
      <div className="from-primary/10 flex flex-col items-center gap-2 bg-gradient-to-br to-transparent p-6 text-center">
        <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          {platform} · {t("receiptTitle")}
        </p>
        <p
          className={`text-3xl font-bold ${
            receipt.direction === "in" ? "text-emerald-600" : "text-foreground"
          }`}
          dir="ltr"
        >
          {receipt.direction === "in" ? "+" : "−"}
          {money(receipt.amountUsd)}
        </p>
        <span
          className={`inline-flex items-center gap-1.5 text-sm font-medium ${
            STATUS_COLOR[receipt.status]
          }`}
        >
          <StatusIcon className="size-4" />
          {t(`status_${receipt.status}`)}
        </span>
      </div>

      {/* Details */}
      <div className="divide-y px-5 py-1">
        <Row label={t("receiptType")}>{t(TYPE_LABEL[receipt.type])}</Row>
        {receipt.counterpartyName ? (
          <Row
            label={
              receipt.direction === "out" ? t("receiptTo") : t("receiptFrom")
            }
          >
            {receipt.counterpartyName}
          </Row>
        ) : null}
        {isBill && receipt.billerSlug ? (
          <Row label={t("receiptBiller")}>
            {billerName(receipt.billerSlug, locale)}
          </Row>
        ) : null}
        {isBill && receipt.account ? (
          <Row label={t("receiptAccount")}>
            <span dir="ltr">{receipt.account}</span>
          </Row>
        ) : null}
        {receipt.method && !isBill ? (
          <Row label={t("receiptMethod")}>{t(`method_${receipt.method}`)}</Row>
        ) : null}
        <Row label={t("receiptDate")}>
          {format.dateTime(receipt.createdAt, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </Row>
        <Row label={t("receiptRef")}>
          <span dir="ltr">{receipt.reference}</span>
        </Row>
      </div>

      <p className="text-muted-foreground bg-muted/30 px-5 py-3 text-center text-xs">
        {t("receiptFooter", { platform })}
      </p>
    </div>
  );
}
