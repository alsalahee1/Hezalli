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

// The confirmedBy stamps that mean a COD order's money is held IN-SYSTEM before
// handover (so delivery collects no cash and a cancel/return must refund).
// This is an explicit allow-list, not "anything that isn't delivery": if a new
// path ever confirms a COD payment with some other stamp (e.g. a raw admin id),
// it must NOT be silently treated as prepaid — that would let a parcel deliver
// with codAmount 0 while no wallet was ever debited (free goods).
const COD_DIGITAL_CONFIRMED_BY: readonly string[] = [COD_WALLET_CONFIRMED_BY];

type PaymentState = {
  paymentMethod: string;
  payment: { status: string; confirmedBy: string | null } | null;
};

// True when a COD order was settled in-system before handover (doorstep wallet
// payment): no cash is due at delivery, and a cancel/return MUST refund the
// buyer. Cash captured at the doorstep (confirmedBy "system:delivery", or null
// on rows that predate the stamp) is NOT digital — that money lives on a
// courier/point cash ledger.
export function codSettledDigitally(order: PaymentState): boolean {
  return (
    order.paymentMethod === "COD" &&
    order.payment?.status === "CONFIRMED" &&
    order.payment.confirmedBy != null &&
    COD_DIGITAL_CONFIRMED_BY.includes(order.payment.confirmedBy)
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
