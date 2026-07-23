"use server";

// Staff management for a delivery point (docs/DELIVERY-POINTS.md §42d): the
// owner (or a store manager) attaches existing Hezalli accounts to the hub as
// employees — store manager, cashier, money collector, shelves organizer —
// changes their job, pauses them, or removes them. Membership is the grant:
// no role is ever written to the employee's User row.
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireDeliveryPoint } from "@/lib/authz";
import {
  canManagePoint,
  POINT_STAFF_ROLES,
  type PointStaffRole,
} from "@/lib/point-access";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string };

// Sanity cap so a compromised owner account can't attach the whole city.
const MAX_STAFF = 20;

const ROLE_LABEL_AR: Record<PointStaffRole, string> = {
  MANAGER: "مدير المحل",
  CASHIER: "كاشير",
  COLLECTOR: "محصّل النقود",
  ORGANIZER: "منظّم الرفوف",
};
const ROLE_LABEL_EN: Record<PointStaffRole, string> = {
  MANAGER: "store manager",
  CASHIER: "cashier",
  COLLECTOR: "money collector",
  ORGANIZER: "shelves organizer",
};

async function revalidateStaff() {
  const locale = await getLocale();
  revalidatePath(`/${locale}/point/staff`);
}

function parseRole(role: string): PointStaffRole | null {
  return (POINT_STAFF_ROLES as readonly string[]).includes(role)
    ? (role as PointStaffRole)
    : null;
}

// Attach an EXISTING Hezalli account (looked up by phone or email, same rule
// as wallet P2P) to this hub. No invite flow: the employee registers a normal
// account first, then the owner types their number here.
export async function addPointStaff(
  identifier: string,
  role: string,
): Promise<Result> {
  const gate = await requireDeliveryPoint();
  if (!gate || !canManagePoint(gate.access)) return { error: "forbidden" };
  const job = parseRole(role);
  if (!job) return { error: "badRole" };
  const id = identifier.trim();
  if (!id) return { error: "userNotFound" };

  const user = await prisma.user.findUnique({
    where: id.includes("@") ? { email: id.toLowerCase() } : { phone: id },
    select: {
      id: true,
      locale: true,
      isSuspended: true,
      deletedAt: true,
      deliveryPoint: { select: { id: true } },
      pointStaff: { select: { pointId: true } },
    },
  });
  if (!user || user.isSuspended || user.deletedAt) {
    return { error: "userNotFound" };
  }
  // A hub owner (this one or any other) can't be hired as counter staff.
  if (user.deliveryPoint) return { error: "ownsPoint" };
  if (user.pointStaff) {
    return user.pointStaff.pointId === gate.pointId
      ? { error: "alreadyStaff" }
      : { error: "staffElsewhere" };
  }

  const [count, point] = await Promise.all([
    prisma.pointStaff.count({ where: { pointId: gate.pointId } }),
    prisma.deliveryPoint.findUnique({
      where: { id: gate.pointId },
      select: { name: true },
    }),
  ]);
  if (count >= MAX_STAFF) return { error: "staffLimit" };

  const ar = user.locale === "ar";
  try {
    await prisma.$transaction([
      prisma.pointStaff.create({
        data: { pointId: gate.pointId, userId: user.id, role: job },
      }),
      prisma.auditLog.create({
        data: {
          actorId: gate.userId,
          action: "point.staffAdd",
          entity: "DeliveryPoint",
          entityId: gate.pointId,
          meta: { staffUserId: user.id, role: job },
        },
      }),
      prisma.notification.create({
        data: {
          userId: user.id,
          type: "SHIPMENT",
          title: ar ? "انضممت إلى فريق نقطة" : "You joined a Hezalli Point",
          body: ar
            ? `أضافك ${point?.name ?? "أحد نقاط حزالي"} إلى فريق العمل بوظيفة ${ROLE_LABEL_AR[job]}. افتح تطبيق النقطة للبدء.`
            : `${point?.name ?? "A Hezalli Point"} added you to its team as ${ROLE_LABEL_EN[job]}. Open the point app to get started.`,
          data: { link: "/point" },
        },
      }),
    ]);
  } catch (e) {
    // Unique userId race: someone hired them between our check and the write.
    if ((e as { code?: string })?.code === "P2002") {
      return { error: "staffElsewhere" };
    }
    throw e;
  }

  await revalidateStaff();
  return { ok: true };
}

// Change an employee's job (e.g. promote a cashier to store manager).
export async function setPointStaffRole(
  staffId: string,
  role: string,
): Promise<Result> {
  const gate = await requireDeliveryPoint();
  if (!gate || !canManagePoint(gate.access)) return { error: "forbidden" };
  const job = parseRole(role);
  if (!job) return { error: "badRole" };

  const row = await prisma.pointStaff.findFirst({
    where: { id: staffId, pointId: gate.pointId },
    select: { id: true, userId: true },
  });
  if (!row) return { error: "notFound" };
  // A manager may not touch their own row (self-promotion / lockout games);
  // the owner's access never comes from a row, so this can't hit the owner.
  if (row.userId === gate.userId) return { error: "isSelf" };

  await prisma.$transaction([
    prisma.pointStaff.update({ where: { id: row.id }, data: { role: job } }),
    prisma.auditLog.create({
      data: {
        actorId: gate.userId,
        action: "point.staffRole",
        entity: "DeliveryPoint",
        entityId: gate.pointId,
        meta: { staffUserId: row.userId, role: job },
      },
    }),
  ]);

  await revalidateStaff();
  return { ok: true };
}

// Pause (leave, end of shift-season) or reinstate an employee. The row and
// its history stay; only access is revoked.
export async function setPointStaffActive(
  staffId: string,
  active: boolean,
): Promise<Result> {
  const gate = await requireDeliveryPoint();
  if (!gate || !canManagePoint(gate.access)) return { error: "forbidden" };

  const row = await prisma.pointStaff.findFirst({
    where: { id: staffId, pointId: gate.pointId },
    select: { id: true, userId: true },
  });
  if (!row) return { error: "notFound" };
  if (row.userId === gate.userId) return { error: "isSelf" };

  await prisma.$transaction([
    prisma.pointStaff.update({
      where: { id: row.id },
      data: { isActive: active },
    }),
    prisma.auditLog.create({
      data: {
        actorId: gate.userId,
        action: active ? "point.staffActivate" : "point.staffDeactivate",
        entity: "DeliveryPoint",
        entityId: gate.pointId,
        meta: { staffUserId: row.userId },
      },
    }),
  ]);

  await revalidateStaff();
  return { ok: true };
}

// Remove an employee outright. Their user account is untouched — only the
// membership goes.
export async function removePointStaff(staffId: string): Promise<Result> {
  const gate = await requireDeliveryPoint();
  if (!gate || !canManagePoint(gate.access)) return { error: "forbidden" };

  const row = await prisma.pointStaff.findFirst({
    where: { id: staffId, pointId: gate.pointId },
    select: { id: true, userId: true },
  });
  if (!row) return { error: "notFound" };
  if (row.userId === gate.userId) return { error: "isSelf" };

  await prisma.$transaction([
    prisma.pointStaff.delete({ where: { id: row.id } }),
    prisma.auditLog.create({
      data: {
        actorId: gate.userId,
        action: "point.staffRemove",
        entity: "DeliveryPoint",
        entityId: gate.pointId,
        meta: { staffUserId: row.userId },
      },
    }),
  ]);

  await revalidateStaff();
  return { ok: true };
}
