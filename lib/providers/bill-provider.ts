// Bill / airtime fulfilment providers (Step 19.13). This is the swappable seam
// described in docs/19-wallet-strategy.md §7. Today the only provider is
// "manual" — a purchase stays PENDING for an admin to fulfil on Admin → Payments.
// To wire a real biller/telco aggregator, implement BillProvider, register it,
// and set the `wallet_bills_provider` platform setting to its id. payBill then
// calls the active provider right after debiting the wallet and auto-resolves
// the purchase (COMPLETED / FAILED / left PENDING for async settlement).
//
// The wallet has already been debited when fulfil() runs, so a provider MUST be
// honest: return COMPLETED only when the biller confirms, FAILED to refund, or
// PENDING to leave it for a later webhook / admin.

export type BillFulfillment =
  | { status: "COMPLETED"; reference: string }
  | { status: "FAILED"; reason: string }
  | { status: "PENDING" };

export type BillFulfillInput = {
  purchaseId: string;
  kind: "BILL" | "AIRTIME";
  biller: string; // slug from lib/wallet-billers.ts
  account: string; // account number / phone
  amountUsd: number;
};

export interface BillProvider {
  readonly id: string;
  fulfill(input: BillFulfillInput): Promise<BillFulfillment>;
}

const registry = new Map<string, BillProvider>();

/** Register a provider so `wallet_bills_provider` can select it by id. */
export function registerBillProvider(provider: BillProvider): void {
  registry.set(provider.id, provider);
}

/** The active provider for an id, or the manual provider as a safe fallback. */
export function getBillProvider(id: string | null | undefined): BillProvider {
  return (id && registry.get(id)) || manualBillProvider;
}

// Built-in default: never auto-resolves — every purchase waits for an admin.
// This is exactly the pre-provider behaviour, so it is safe as the default.
export const manualBillProvider: BillProvider = {
  id: "manual",
  async fulfill() {
    return { status: "PENDING" };
  },
};

registerBillProvider(manualBillProvider);
