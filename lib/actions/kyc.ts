"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { audit } from "@/lib/audit";
import { requireWalletManagerId } from "@/lib/authz";
import { notify } from "@/lib/notify";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string };

// Wallet staff reviews a KYC submission. VERIFIED unlocks wallet cash-outs
// and P2P sends for the user (see lib/actions/wallet-withdrawal.ts), which is
// why the money desk owns this review. Audited; the user is notified.
export async function reviewKyc(
  sellerProfileId: string,
  verdict: "VERIFIED" | "REJECTED",
  note?: string,
): Promise<Result> {
  const staffId = await requireWalletManagerId();
  if (!staffId) return { error: "forbidden" };
  if (verdict !== "VERIFIED" && verdict !== "REJECTED") {
    return { error: "badVerdict" };
  }
  const locale = await getLocale();

  const profile = await prisma.sellerProfile.findUnique({
    where: { id: sellerProfileId },
    select: {
      id: true,
      kycStatus: true,
      user: { select: { id: true, locale: true } },
    },
  });
  if (!profile) return { error: "notFound" };
  if (profile.kycStatus === verdict) return { error: "badState" };

  await prisma.sellerProfile.update({
    where: { id: profile.id },
    data: {
      kycStatus: verdict,
      kycReviewedBy: staffId,
      kycReviewedAt: new Date(),
    },
  });

  await audit(staffId, "kyc.review", "SellerProfile", profile.id, {
    from: profile.kycStatus,
    to: verdict,
    note: note?.trim() || null,
  });

  const ar = profile.user.locale === "ar";
  await notify({
    userId: profile.user.id,
    type: "SYSTEM",
    title:
      verdict === "VERIFIED"
        ? ar
          ? "تم التحقق من هويتك"
          : "Identity verified"
        : ar
          ? "لم يتم قبول التحقق من الهوية"
          : "Identity verification rejected",
    body:
      verdict === "VERIFIED"
        ? ar
          ? "أصبح بإمكانك الآن سحب رصيد محفظتك."
          : "You can now withdraw your wallet balance."
        : (note?.trim() ??
          (ar
            ? "يرجى إعادة إرسال مستندات صحيحة."
            : "Please resubmit valid documents.")),
    link: "/account/wallet",
  }).catch(() => {});

  revalidatePath(`/${locale}/wallet-manager/kyc`);
  revalidatePath(`/${locale}/admin/sellers`);
  return { ok: true };
}
