import { z } from "zod";

// Payout destination (DECISIONS.md §4/§7): manual rails — bank transfer,
// Yemeni mobile wallets, or USDT. Stored on PayoutMethod (kind + details
// Json). Error messages are KEYS under the `Payout` i18n namespace.

export const WALLET_PROVIDERS = [
  "Jawali",
  "Jaib",
  "Floosak",
  "Kuraimi Cash",
  "Other",
] as const;

const accountName = z.string().trim().min(2, "accountNameShort").max(80);

export const payoutMethodSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("bank"),
    bankName: z.string().trim().min(2, "bankNameShort").max(80),
    accountName,
    accountNumber: z.string().trim().min(3, "accountNumberShort").max(40),
  }),
  z.object({
    kind: z.literal("wallet"),
    provider: z.enum(WALLET_PROVIDERS, { error: "providerRequired" }),
    accountName,
    walletNumber: z
      .string()
      .trim()
      .regex(/^\+?[\d\s-]{7,20}$/, "walletNumberInvalid"),
  }),
  z
    .object({
      kind: z.literal("usdt"),
      network: z.enum(["TRC20", "ERC20"], { error: "networkRequired" }),
      address: z.string().trim(),
    })
    .superRefine((d, ctx) => {
      // Address must match the chosen network's standard shape —
      // TRC20 = T + 33 base58 chars, ERC20 = 0x + 40 hex chars.
      const ok =
        d.network === "TRC20"
          ? /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(d.address)
          : /^0x[0-9a-fA-F]{40}$/.test(d.address);
      if (!ok) {
        ctx.addIssue({
          code: "custom",
          message: "addressInvalid",
          path: ["address"],
        });
      }
    }),
]);

export type PayoutMethodInput = z.infer<typeof payoutMethodSchema>;

// details Json stored per kind (everything except `kind` itself).
export type PayoutDetails = Omit<PayoutMethodInput, "kind">;
