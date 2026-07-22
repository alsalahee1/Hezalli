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

// A user submits (or resubmits) their identity documents for verification.
// Only sellers (who have a SellerProfile) can submit — it's the record KYC
// hangs off, and VERIFIED is what unlocks wallet cash-outs. Allowed only from
// NONE / REJECTED (not while PENDING or already VERIFIED). Notifies the money
// desk that a new submission is waiting.
export async function submitKyc(docs: {
  idFront?: string;
  idBack?: string;
  selfie?: string;
}): Promise<Result> {
  const { auth } = await import("@/auth");
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "unauthorized" };
  const locale = await getLocale();

  const idFront = docs.idFront?.trim();
  const selfie = docs.selfie?.trim();
  // ID front + selfie are the minimum; back is optional (some IDs are 1-sided).
  if (!idFront || !selfie) return { error: "docsRequired" };

  const profile = await prisma.sellerProfile.findUnique({
    where: { userId },
    select: { id: true, kycStatus: true },
  });
  if (!profile) return { error: "notSeller" };
  if (profile.kycStatus === "PENDING") return { error: "alreadyPending" };
  if (profile.kycStatus === "VERIFIED") return { error: "alreadyVerified" };

  await prisma.sellerProfile.update({
    where: { id: profile.id },
    data: {
      kycStatus: "PENDING",
      kycDocs: {
        idFront,
        ...(docs.idBack?.trim() ? { idBack: docs.idBack.trim() } : {}),
        selfie,
        submittedAt: new Date().toISOString(),
      },
      kycReviewedBy: null,
      kycReviewedAt: null,
    },
  });

  // Alert wallet staff (+ admins) that a submission is waiting.
  const staff = await prisma.user.findMany({
    where: {
      isSuspended: false,
      deletedAt: null,
      roles: { hasSome: ["WALLET_MANAGER", "ADMIN"] },
    },
    select: { id: true, locale: true },
  });
  await Promise.all(
    staff.map((u) => {
      const ar = u.locale === "ar";
      return notify({
        userId: u.id,
        type: "SYSTEM",
        title: ar ? "طلب توثيق هوية جديد" : "New KYC submission",
        body: ar
          ? "بانتظار المراجعة في قائمة التوثيق."
          : "Awaiting review in the KYC queue.",
        link: "/wallet-manager/kyc",
        push: false,
      }).catch(() => {});
    }),
  );

  revalidatePath(`/${locale}/seller/settings`);
  revalidatePath(`/${locale}/wallet-manager/kyc`);
  return { ok: true };
}
