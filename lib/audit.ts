import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

// Write one audit-log row for a staff action (admin or scoped manager).
// Shown in /admin/audit. Fire inside or after the mutating transaction.
export async function audit(
  actorId: string,
  action: string,
  entity: string,
  entityId: string,
  meta?: Prisma.InputJsonValue,
): Promise<void> {
  await prisma.auditLog.create({
    data: { actorId, action, entity, entityId, meta: meta ?? {} },
  });
}
