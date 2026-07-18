"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { requireAdminId, requireSellerStore } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { validateCoupon, type CartGroup } from "@/lib/vouchers";

type Result = { ok?: boolean; error?: string };

// Live discount preview at checkout.
export async function previewCoupon(
  code: string,
  groups: CartGroup[],
): Promise<{
  ok: boolean;
  error?: string;
  discount?: number;
  freeShipping?: boolean;
}> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "unauthorized" };
  if (!code.trim()) return { ok: false, error: "notFound" };
  const res = await validateCoupon(code, session.user.id, groups);
  if (!res.ok) return { ok: false, error: res.error };
  return {
    ok: true,
    discount: res.discount.total,
    freeShipping: res.discount.freeShipping,
  };
}

export type CouponInput = {
  id?: string;
  code: string;
  scope: "PLATFORM" | "SELLER";
  discountType: "PERCENT" | "FIXED" | "FREE_SHIPPING";
  value: number;
  maxDiscountUsd?: number | null;
  minSpendUsd?: number | null;
  maxUses?: number | null;
  perUserLimit?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive: boolean;
};

function num(v: number | null | undefined): number | null {
  return v == null || Number.isNaN(v) || v < 0 ? null : v;
}
function dt(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Create/update a coupon. Admins may scope platform-wide or to a store; sellers
// are forced to their own store.
export async function saveCoupon(input: CouponInput): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized" };
  const adminId = await requireAdminId();
  const gate = adminId ? null : await requireSellerStore();
  if (!adminId && !gate) return { error: "forbidden" };

  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,24}$/.test(code)) return { error: "badCode" };
  if (input.discountType !== "FREE_SHIPPING" && !(input.value > 0)) {
    return { error: "badValue" };
  }
  if (input.discountType === "PERCENT" && input.value > 100) {
    return { error: "badValue" };
  }

  // Resolve scope/store per role.
  let scope: "PLATFORM" | "SELLER" = input.scope;
  let storeId: string | null = null;
  if (gate) {
    scope = "SELLER";
    storeId = gate.storeId;
  } else if (scope === "SELLER") {
    return { error: "badScope" }; // admin store-coupons not supported in this UI
  }

  // If editing, verify ownership.
  if (input.id) {
    const existing = await prisma.coupon.findUnique({
      where: { id: input.id },
      select: { storeId: true },
    });
    if (!existing) return { error: "notFound" };
    if (gate && existing.storeId !== gate.storeId)
      return { error: "forbidden" };
  }

  // Unique code (excluding self).
  const clash = await prisma.coupon.findUnique({
    where: { code },
    select: { id: true },
  });
  if (clash && clash.id !== input.id) return { error: "codeTaken" };

  const data = {
    code,
    scope,
    storeId,
    discountType: input.discountType,
    value: input.discountType === "FREE_SHIPPING" ? 0 : input.value,
    maxDiscountUsd: num(input.maxDiscountUsd),
    minSpendUsd: num(input.minSpendUsd),
    maxUses: input.maxUses == null ? null : Math.floor(input.maxUses),
    perUserLimit:
      input.perUserLimit == null ? null : Math.floor(input.perUserLimit),
    startsAt: dt(input.startsAt),
    endsAt: dt(input.endsAt),
    isActive: input.isActive,
  };

  if (input.id) {
    await prisma.coupon.update({ where: { id: input.id }, data });
  } else {
    await prisma.coupon.create({ data });
  }

  const locale = await getLocale();
  revalidatePath(`/${locale}/${gate ? "seller" : "admin"}/promotions`);
  return { ok: true };
}

async function ownedCoupon(id: string): Promise<{ ok: boolean }> {
  const adminId = await requireAdminId();
  if (adminId) return { ok: true };
  const gate = await requireSellerStore();
  if (!gate) return { ok: false };
  const c = await prisma.coupon.findUnique({
    where: { id },
    select: { storeId: true },
  });
  return { ok: Boolean(c && c.storeId === gate.storeId) };
}

export async function deleteCoupon(id: string): Promise<Result> {
  if (!(await ownedCoupon(id)).ok) return { error: "forbidden" };
  await prisma.coupon.delete({ where: { id } });
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/promotions`);
  revalidatePath(`/${locale}/seller/promotions`);
  return { ok: true };
}

export async function setCouponActive(
  id: string,
  isActive: boolean,
): Promise<Result> {
  if (!(await ownedCoupon(id)).ok) return { error: "forbidden" };
  await prisma.coupon.update({ where: { id }, data: { isActive } });
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/promotions`);
  revalidatePath(`/${locale}/seller/promotions`);
  return { ok: true };
}
