// Shared return constants/types (importable by client components and the
// "use server" actions module, which may only export async functions).
export const RETURN_REASONS = [
  "damaged",
  "wrong_item",
  "not_as_described",
  "missing_parts",
  "changed_mind",
  "other",
] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];
export type ReturnType = "refund_only" | "return_and_refund";
