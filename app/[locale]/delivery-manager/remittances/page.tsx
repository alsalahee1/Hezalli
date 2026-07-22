import { getFormatter, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import {
  RemitClaimQueue,
  type RemitClaimRow,
} from "@/components/ops/remit-claim-queue";

export const dynamic = "force-dynamic";

// Pending digital COD remittance claims (docs §38) from drivers and points,
// oldest first. Approval settles the claimant's cash ledger; recent decisions
// are listed below for reference.
export default async function DeliveryManagerRemittancesPage() {
  const t = await getTranslations("DeliveryManager");
  const format = await getFormatter();

  const [pending, decided] = await Promise.all([
    prisma.remitClaim.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        courier: { select: { name: true, email: true } },
        point: { select: { name: true } },
      },
    }),
    prisma.remitClaim.findMany({
      where: { status: { not: "PENDING" } },
      orderBy: { processedAt: "desc" },
      take: 20,
      include: {
        courier: { select: { name: true, email: true } },
        point: { select: { name: true } },
      },
    }),
  ]);

  const toRow = (c: (typeof pending)[number]): RemitClaimRow => ({
    id: c.id,
    who: c.point?.name ?? c.courier?.name ?? c.courier?.email ?? c.id.slice(-6),
    kind: c.pointId ? "point" : "courier",
    amountUsd: Number(c.amountUsd),
    method: c.method,
    reference: c.reference,
    createdAt: format.dateTime(c.createdAt, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("remitTitle")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("remitSubtitle")}</p>
      </div>

      <RemitClaimQueue claims={pending.map(toRow)} />

      {decided.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">{t("remitHistory")}</h2>
          <ul className="divide-y rounded-lg border">
            {decided.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {c.point?.name ??
                      c.courier?.name ??
                      c.courier?.email ??
                      c.id.slice(-6)}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {c.method} · <span dir="ltr">{c.reference}</span>
                    {c.reviewNote ? ` — ${c.reviewNote}` : null}
                  </p>
                </div>
                <span className="font-semibold" dir="ltr">
                  ${Number(c.amountUsd).toFixed(2)}
                </span>
                <span
                  className={
                    c.status === "APPROVED"
                      ? "rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-medium text-emerald-600"
                      : "bg-destructive/10 text-destructive rounded px-1.5 py-0.5 text-xs font-medium"
                  }
                >
                  {t(`remitStatus_${c.status}`)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
