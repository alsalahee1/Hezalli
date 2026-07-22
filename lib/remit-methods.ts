// The rails ops can verify for digital COD remittance (docs §38). Shared by
// the claim forms (option list) and the server actions (validation) so a
// client can never invent a method.
export const REMIT_METHODS = [
  "JAWALI",
  "JAIB",
  "FLOOSAK",
  "KURAIMI",
  "BANK",
] as const;

export type RemitMethod = (typeof REMIT_METHODS)[number];
