import { getFormatter, getTranslations } from "next-intl/server";

import { requireSellerStore } from "@/lib/authz";
import { autoApproveReturns } from "@/lib/actions/return";
import { type ReturnType } from "@/lib/returns";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { ReturnActions } from "@/components/seller/return-actions";

const BADGE: Record<string, string> = {
  REQUESTED: "bg-amber-500/15 text-amber-600",
  APPROVED: "bg-blue-500/15 text-blue-600",
  IN_TRANSIT: "bg-indigo-500/15 text-indigo-600",
  RECEIVED: "bg-blue-500/15 text-blue-600",
  REJECTED: "bg-destructive/10 text-destructive",
  REFUNDED: "bg-emerald-500/15 text-emerald-600",
  CLOSED: "bg-muted text-muted-foreground",
};

const ACTIVE = ["REQUESTED", "APPROVED", "IN_TRANSIT", "RECEIVED"];

export default async function SellerReturnsPage() {
  const gate = await requireSellerStore();
  if (!gate) return null;
  // Seller silence auto-approves stale requests (also runs via cron).
  await autoApproveReturns().catch(() => {});

  const t = await getTranslations("SellerReturns");
  const format = await getFormatter();

  const returns = await prisma.returnRequest.findMany({
    where: { subOrder: { storeId: gate.storeId } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      status: true,
      reason: true,
      resolution: true,
      evidence: true,
      createdAt: true,
      dispute: { select: { id: true } },
      buyer: { select: { name: true } },
      subOrder: {
        select: {
          itemsTotal: true,
          shippingTotal: true,
          order: { select: { id: true } },
        },
      },
    },
  });

  const active = returns.filter((r) => ACTIVE.includes(r.status));
  const history = returns.filter((r) => !ACTIVE.includes(r.status));
  const money = (n: unknown) =>
    format.number(Number(n), { style: "currency", currency: "USD" });

  const card = (r: (typeof returns)[number]) => {
    const ev = (r.evidence ?? {}) as {
      type?: ReturnType;
      description?: string;
      photos?: string[];
      returnTracking?: string | null;
    };
    const type: ReturnType =
      ev.type === "refund_only" ? "refund_only" : "return_and_refund";
    const amount =
      Number(r.subOrder.itemsTotal) + Number(r.subOrder.shippingTotal);
    return (
      <li key={r.id} className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm">
            <span className="font-medium">
              #{r.subOrder.order.id.slice(-8).toUpperCase()}
            </span>
            <span className="text-muted-foreground">
              {" "}
              · {r.buyer.name ?? "—"} ·{" "}
              {format.dateTime(r.createdAt, { dateStyle: "medium" })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold" dir="ltr">
              {money(amount)}
            </span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-xs font-medium",
                BADGE[r.status] ?? "bg-muted",
              )}
            >
              {t(`status_${r.status}`)}
            </span>
            {r.dispute ? (
              <span className="bg-destructive/10 text-destructive rounded px-1.5 py-0.5 text-xs font-medium">
                {t("escalated")}
              </span>
            ) : null}
          </div>
        </div>

        <p className="text-sm">
          <span className="text-muted-foreground">{t("reason")}: </span>
          {t(`reason_${r.reason}`)} · {t(`type_${type}`)}
        </p>
        {ev.description ? (
          <p className="text-muted-foreground text-sm">{ev.description}</p>
        ) : null}
        {ev.returnTracking ? (
          <p className="text-sm">
            <span className="text-muted-foreground">
              {t("buyerTracking")}:{" "}
            </span>
            <span dir="ltr">{ev.returnTracking}</span>
          </p>
        ) : null}
        {ev.photos && ev.photos.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {ev.photos.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="size-16 overflow-hidden rounded border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="size-full object-cover" />
              </a>
            ))}
          </div>
        ) : null}
        {r.resolution ? (
          <p className="text-muted-foreground text-sm italic">{r.resolution}</p>
        ) : null}

        {ACTIVE.includes(r.status) ? (
          <ReturnActions
            returnId={r.id}
            status={r.status}
            type={type}
            hasDispute={Boolean(r.dispute)}
          />
        ) : null}
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">{t("activeTitle")}</h2>
        {active.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
            {t("noActive")}
          </div>
        ) : (
          <ul className="space-y-3">{active.map(card)}</ul>
        )}
      </section>

      {history.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-semibold">{t("historyTitle")}</h2>
          <ul className="space-y-3">{history.map(card)}</ul>
        </section>
      ) : null}
    </div>
  );
}
