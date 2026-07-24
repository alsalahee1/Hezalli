"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireAdminId } from "@/lib/authz";
import {
  DELIVERY_SCOPES,
  type DeliveryScope,
  isDeliveryScope,
} from "@/lib/delivery-access";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/generated/prisma/client";

type Result = { ok?: boolean; error?: string };

// Read the desired desk scopes out of a form. Empty = Head of Delivery (every
// desk); otherwise the checked desks, de-duped and validated against the enum.
function readScopes(formData: FormData): DeliveryScope[] {
  const picked = formData.getAll("scopes").map(String).filter(isDeliveryScope);
  return DELIVERY_SCOPES.filter((s) => picked.includes(s));
}

// Admin only: put a user on the delivery-ops team (grants DELIVERY_MANAGER if
// missing) and set which desks they may work. No desks checked = Head of
// Delivery, full access. Look the user up by email so admins don't juggle ids.
export async function saveDeliveryTeamMember(
  formData: FormData,
): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) return { error: "emailRequired" };

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, deletedAt: null },
    select: { id: true, roles: true },
  });
  if (!user) return { error: "userNotFound" };

  const scopes = readScopes(formData);
  const roles: Role[] = user.roles.includes("DELIVERY_MANAGER")
    ? user.roles
    : [...user.roles, "DELIVERY_MANAGER"];

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { roles: { set: roles }, deliveryScopes: { set: scopes } },
    }),
    prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: "deliveryTeam.setScopes",
        entity: "User",
        entityId: user.id,
        meta: { scopes: scopes.length ? scopes : "ALL" },
      },
    }),
  ]);

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/delivery-team`);
  return { ok: true };
}

// Admin only: update just the desk scopes of an existing team member (by id,
// from the roster). Same rule: empty = Head of Delivery.
export async function updateDeliveryTeamScopes(
  formData: FormData,
): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "userNotFound" };

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, roles: { has: "DELIVERY_MANAGER" } },
    select: { id: true },
  });
  if (!user) return { error: "userNotFound" };

  const scopes = readScopes(formData);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { deliveryScopes: { set: scopes } },
    }),
    prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: "deliveryTeam.setScopes",
        entity: "User",
        entityId: user.id,
        meta: { scopes: scopes.length ? scopes : "ALL" },
      },
    }),
  ]);

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/delivery-team`);
  return { ok: true };
}

// Admin only: take a member off the delivery-ops team — drop the
// DELIVERY_MANAGER role and clear their desks. Their history stays; access
// stops on the next request (gates read the DB, not the JWT).
export async function removeDeliveryTeamMember(
  formData: FormData,
): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "userNotFound" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, roles: true },
  });
  if (!user) return { error: "userNotFound" };

  const roles: Role[] = user.roles.filter((r) => r !== "DELIVERY_MANAGER");
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { roles: { set: roles }, deliveryScopes: { set: [] } },
    }),
    prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: "deliveryTeam.remove",
        entity: "User",
        entityId: user.id,
      },
    }),
  ]);

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/delivery-team`);
  return { ok: true };
}
