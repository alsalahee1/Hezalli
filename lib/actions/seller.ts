"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth, updateSession } from "@/auth";
import type { Role } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { slugifyWithFallback } from "@/lib/slug";
import { becomeSellerSchema } from "@/lib/validations/seller";
import { fieldErrors } from "@/lib/validations/auth";
import { redirect } from "@/i18n/navigation";

// Message values are i18n KEYS (translated by the client forms) — `Sell`
// namespace for the become-seller form, `AdminSellers` for the admin screen.
export type FormState = {
  errors?: Record<string, string>;
  formError?: string;
};

// Pick a slug that is not taken yet: base, base-2, base-3, …
async function uniqueStoreSlug(name: string): Promise<string> {
  const base = slugifyWithFallback(name, "store");
  let candidate = base;
  for (let n = 2; ; n++) {
    const taken = await prisma.store.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
    candidate = `${base}-${n}`;
  }
}

// "Become a seller" — automatic approval (DECISIONS.md §7): creates the
// SellerProfile (+ balance) and an ACTIVE Store immediately, adds the SELLER
// role, and refreshes the session JWT so the seller center opens right away.
// KYC stays NONE here — it gates payouts (Phase 9), not listing.
export async function becomeSeller(
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { formError: "notSignedIn" };

  const parsed = becomeSellerSchema.safeParse({
    storeName: formData.get("storeName"),
    description: formData.get("description") || undefined,
    phone: formData.get("phone"),
    acceptTerms: formData.get("acceptTerms") === "on",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { sellerProfile: { include: { store: true } } },
  });
  if (!user || user.isSuspended || user.deletedAt)
    return { formError: "notSignedIn" };

  const locale = await getLocale();

  // Already a seller with a store → nothing to create.
  if (!user.sellerProfile?.store) {
    const { storeName, description } = parsed.data;
    const phone = parsed.data.phone?.trim();
    const slug = await uniqueStoreSlug(storeName);
    const roles: Role[] = user.roles.includes("SELLER")
      ? user.roles
      : [...user.roles, "SELLER"];

    const storeData = {
      name: storeName,
      slug,
      description: description || null,
      status: "ACTIVE" as const,
    };

    try {
      if (user.sellerProfile) {
        // Profile exists without a store (defensive) — attach one.
        await prisma.store.create({
          data: { sellerId: user.sellerProfile.id, ...storeData },
        });
      } else {
        // Single nested write = atomic: role + profile + balance + store.
        await prisma.user.update({
          where: { id: userId },
          data: {
            roles: { set: roles },
            ...(phone ? { phone } : {}),
            sellerProfile: {
              create: {
                kycStatus: "NONE",
                balance: { create: {} },
                store: { create: storeData },
              },
            },
          },
        });
      }
    } catch (error) {
      // Unique-constraint race: phone already used, or slug taken between
      // check and write.
      const target = String(
        (error as { meta?: { target?: unknown } })?.meta?.target ?? "",
      );
      if (target.includes("phone")) return { errors: { phone: "phoneTaken" } };
      return { formError: "createFailed" };
    }

    // Refresh the JWT so the SELLER role applies without re-login (the
    // seller layout also re-checks roles in the DB — belt and suspenders).
    await updateSession({ user: { roles } });
  }

  redirect({ href: "/seller", locale });
  return {}; // unreachable — redirect throws
}

// Admin oversight (post-moderation model): suspend or reactivate a store.
// The action is audited with the optional reason.
export async function setStoreStatus(formData: FormData): Promise<void> {
  const session = await auth();
  const adminId = session?.user?.id;
  if (!adminId) return;

  // Authoritative role check against the DB — never trust the client.
  const admin = await prisma.user.findUnique({
    where: { id: adminId },
    select: { roles: true, isSuspended: true, deletedAt: true },
  });
  if (!admin?.roles.includes("ADMIN") || admin.isSuspended || admin.deletedAt)
    return;

  const storeId = String(formData.get("storeId") ?? "");
  const status = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!storeId || (status !== "ACTIVE" && status !== "SUSPENDED")) return;

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || store.status === status) return;

  await prisma.$transaction([
    prisma.store.update({ where: { id: storeId }, data: { status } }),
    prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: status === "SUSPENDED" ? "store.suspend" : "store.reactivate",
        entity: "Store",
        entityId: storeId,
        meta: reason ? { reason } : undefined,
      },
    }),
  ]);

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/sellers`);
}
