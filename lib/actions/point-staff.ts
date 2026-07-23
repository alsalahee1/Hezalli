"use server";

// Staff management for a delivery point (docs/DELIVERY-POINTS.md §42d): the
// owner (or a store manager) attaches existing Hezalli accounts to the hub as
// employees — store manager, cashier, money collector, shelves organizer —
// changes their job, pauses them, or removes them. Membership is the grant:
// no role is ever written to the employee's User row.
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireDeliveryManagerId, requireDeliveryPoint } from "@/lib/authz";
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

// A localized in-app notice for the employee when their standing changes, so
// they learn of a demotion/pause/removal from a message rather than by hitting
// a wall in the app. Mirrors the hire notice.
function staffNotice(
  locale: string,
  pointName: string | null,
  kind: "role" | "paused" | "activated" | "removed",
  role?: PointStaffRole,
): { title: string; body: string; link: string } {
  const ar = locale === "ar";
  const p = pointName || (ar ? "نقطة حزالي" : "Hezalli Point");
  switch (kind) {
    case "role":
      return {
        title: ar ? "تغيّرت وظيفتك" : "Your role changed",
        body: ar
          ? `غيّر ${p} وظيفتك إلى ${ROLE_LABEL_AR[role!]}.`
          : `${p} changed your role to ${ROLE_LABEL_EN[role!]}.`,
        link: "/point",
      };
    case "paused":
      return {
        title: ar ? "أُوقف وصولك مؤقتًا" : "Your access was paused",
        body: ar
          ? `أوقف ${p} وصولك مؤقتًا. تواصل مع الإدارة لمعرفة التفاصيل.`
          : `${p} paused your access. Contact the manager for details.`,
        link: "/",
      };
    case "activated":
      return {
        title: ar ? "أُعيد تفعيل وصولك" : "Your access was restored",
        body: ar
          ? `أعاد ${p} تفعيل وصولك — يمكنك العودة للعمل في تطبيق النقطة.`
          : `${p} restored your access — you can work in the point app again.`,
        link: "/point",
      };
    case "removed":
      return {
        title: ar ? "أُزلت من الفريق" : "You were removed from the team",
        body: ar
          ? `أزالك ${p} من فريق العمل.`
          : `${p} removed you from its team.`,
        link: "/",
      };
  }
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
    select: {
      id: true,
      userId: true,
      user: { select: { locale: true } },
      point: { select: { name: true } },
    },
  });
  if (!row) return { error: "notFound" };
  // A manager may not touch their own row (self-promotion / lockout games);
  // the owner's access never comes from a row, so this can't hit the owner.
  if (row.userId === gate.userId) return { error: "isSelf" };

  const notice = staffNotice(row.user.locale, row.point.name, "role", job);
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
    prisma.notification.create({
      data: {
        userId: row.userId,
        type: "SHIPMENT",
        title: notice.title,
        body: notice.body,
        data: { link: notice.link },
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
    select: {
      id: true,
      userId: true,
      user: { select: { locale: true } },
      point: { select: { name: true } },
    },
  });
  if (!row) return { error: "notFound" };
  if (row.userId === gate.userId) return { error: "isSelf" };

  const notice = staffNotice(
    row.user.locale,
    row.point.name,
    active ? "activated" : "paused",
  );
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
    prisma.notification.create({
      data: {
        userId: row.userId,
        type: "SHIPMENT",
        title: notice.title,
        body: notice.body,
        data: { link: notice.link },
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
    select: {
      id: true,
      userId: true,
      user: { select: { locale: true } },
      point: { select: { name: true } },
    },
  });
  if (!row) return { error: "notFound" };
  if (row.userId === gate.userId) return { error: "isSelf" };

  const notice = staffNotice(row.user.locale, row.point.name, "removed");
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
    prisma.notification.create({
      data: {
        userId: row.userId,
        type: "SHIPMENT",
        title: notice.title,
        body: notice.body,
        data: { link: notice.link },
      },
    }),
  ]);

  await revalidateStaff();
  return { ok: true };
}

// Ops lever (admin / delivery-manager): pause or reinstate a hub's staff
// member — e.g. freeze a rogue employee during a fraud investigation without
// waiting on the owner. Scoped by pointId so the staffId must belong to that
// hub. Removal and role changes stay the owner's call; ops only holds the
// access switch. Audited (byOps) and the employee is notified.
export async function adminSetPointStaffActive(
  pointId: string,
  staffId: string,
  active: boolean,
): Promise<Result> {
  const adminId = await requireDeliveryManagerId();
  if (!adminId) return { error: "forbidden" };

  const row = await prisma.pointStaff.findFirst({
    where: { id: staffId, pointId },
    select: {
      id: true,
      userId: true,
      user: { select: { locale: true } },
      point: { select: { name: true } },
    },
  });
  if (!row) return { error: "notFound" };

  const notice = staffNotice(
    row.user.locale,
    row.point.name,
    active ? "activated" : "paused",
  );
  await prisma.$transaction([
    prisma.pointStaff.update({
      where: { id: row.id },
      data: { isActive: active },
    }),
    prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: active ? "point.staffActivate" : "point.staffDeactivate",
        entity: "DeliveryPoint",
        entityId: pointId,
        meta: { staffUserId: row.userId, byOps: true },
      },
    }),
    prisma.notification.create({
      data: {
        userId: row.userId,
        type: "SHIPMENT",
        title: notice.title,
        body: notice.body,
        data: { link: notice.link },
      },
    }),
  ]);

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/points/${pointId}`);
  revalidatePath(`/${locale}/delivery-manager/points/${pointId}`);
  return { ok: true };
}
