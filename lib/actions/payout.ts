"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { payoutMethodSchema } from "@/lib/validations/payout";
import { fieldErrors } from "@/lib/validations/auth";

// Message values are i18n KEYS under the `Payout` namespace.
export type FormState = {
  errors?: Record<string, string>;
  formError?: string;
  ok?: boolean;
};

// Saves THE payout destination (one method for now; Phase 9 can extend to
// several). Replaces any existing method atomically.
export async function savePayoutMethod(
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { formError: "notSignedIn" };

  const profile = await prisma.sellerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) return { formError: "notSeller" };

  const kind = String(formData.get("kind") ?? "");
  const parsed = payoutMethodSchema.safeParse(
    kind === "bank"
      ? {
          kind,
          bankName: formData.get("bankName"),
          accountName: formData.get("accountName"),
          accountNumber: formData.get("accountNumber"),
        }
      : kind === "wallet"
        ? {
            kind,
            provider: formData.get("provider"),
            accountName: formData.get("accountName"),
            walletNumber: formData.get("walletNumber"),
          }
        : {
            kind: "usdt",
            network: formData.get("network"),
            address: formData.get("address"),
          },
  );
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { kind: methodKind, ...details } = parsed.data;

  await prisma.$transaction([
    prisma.payoutMethod.deleteMany({ where: { sellerId: profile.id } }),
    prisma.payoutMethod.create({
      data: {
        sellerId: profile.id,
        kind: methodKind,
        details,
        isDefault: true,
      },
    }),
  ]);

  const locale = await getLocale();
  revalidatePath(`/${locale}/seller/settings`);
  return { ok: true };
}
