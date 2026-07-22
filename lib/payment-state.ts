// Pure helpers for deciding whether an order's money was settled in-system.
//
// A COD order's Payment row flips to CONFIRMED in two very different ways:
// digitally BEFORE handover (payCodWithWallet, docs §39 — the wallet was
// debited, so the money is in-system and refundable) or by CASH capture at
// delivery (markSubOrderDelivered — physical cash sitting on a courier/point
// ledger). Refund and cash-collection paths must tell the two apart, so the
// system paths stamp Payment.confirmedBy and this module is the single place
// that interprets it.

// Payment.confirmedBy stamps written by the system paths.
export const COD_WALLET_CONFIRMED_BY = "buyer:wallet";
export const COD_DELIVERY_CONFIRMED_BY = "system:delivery";

type PaymentState = {
  paymentMethod: string;
  payment: { status: string; confirmedBy: string | null } | null;
};

// True when a COD order was settled in-system before handover (doorstep wallet
// payment, or a manual in-system confirmation): no cash is due at delivery,
// and a cancel/return MUST refund the buyer. Cash captured at the doorstep
// (confirmedBy "system:delivery", or null on rows that predate the stamp) is
// NOT digital — that money lives on a courier/point cash ledger.
export function codSettledDigitally(order: PaymentState): boolean {
  return (
    order.paymentMethod === "COD" &&
    order.payment?.status === "CONFIRMED" &&
    order.payment.confirmedBy != null &&
    order.payment.confirmedBy !== COD_DELIVERY_CONFIRMED_BY
  );
}

// True when the buyer's money for this order was captured in-system and must
// be returned to them if the order is cancelled or the parcel comes back:
// any confirmed non-COD payment (wallet at placement, bank/USDT/local wallet
// after admin confirmation), or a COD order settled digitally.
export function paymentCapturedInSystem(order: PaymentState): boolean {
  return (
    order.payment?.status === "CONFIRMED" &&
    (order.paymentMethod !== "COD" || codSettledDigitally(order))
  );
}
