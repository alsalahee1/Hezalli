import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { DisputeComposer } from "@/components/admin/dispute-thread";
import { DisputeVerdict } from "@/components/admin/dispute-verdict";

const ACTIVE = ["OPEN", "UNDER_REVIEW"];

export default async function AdminDisputeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("AdminDisputes");
  const format = await getFormatter();

  const dispute = await prisma.dispute.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      verdict: true,
      createdAt: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          senderId: true,
          body: true,
          createdAt: true,
        },
      },
      returnRequest: {
        select: {
          reason: true,
          resolution: true,
          evidence: true,
          buyerId: true,
          buyer: { select: { name: true } },
          subOrder: {
            select: {
              itemsTotal: true,
              shippingTotal: true,
              order: { select: { id: true } },
              store: {
                select: {
                  name: true,
                  seller: {
                    select: {
                      userId: true,
                      user: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!dispute) notFound();

  const r = dispute.returnRequest;
  const ev = (r.evidence ?? {}) as {
    type?: string;
    description?: string;
    photos?: string[];
    returnTracking?: string | null;
  };
  const buyerId = r.buyerId;
  const sellerUserId = r.subOrder.store.seller.userId;
  const maxAmount =
    Number(r.subOrder.itemsTotal) + Number(r.subOrder.shippingTotal);
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const who = (senderId: string) =>
    senderId === buyerId
      ? (r.buyer.name ?? t("buyer"))
      : senderId === sellerUserId
        ? (r.subOrder.store.seller.user.name ?? t("seller"))
        : t("hezalli");
  const side = (senderId: string) =>
    senderId === buyerId
      ? "buyer"
      : senderId === sellerUserId
        ? "seller"
        : "admin";

  const isActive = ACTIVE.includes(dispute.status);

  return (
    <div className="space-y-6">
      <Link
        href="/admin/disputes"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("backToDisputes")}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            #{r.subOrder.order.id.slice(-8).toUpperCase()}
          </h1>
          <p className="text-muted-foreground text-sm">
            {r.subOrder.store.name} · {money(maxAmount)}
          </p>
        </div>
        <Link
          href={`/admin/orders/${r.subOrder.order.id}`}
          className="text-primary text-sm hover:underline"
        >
          {t("viewOrder")}
        </Link>
      </div>

      {/* Statements */}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border p-4 text-sm">
          <h3 className="mb-2 font-medium">{t("buyerStatement")}</h3>
          <p>
            <span className="text-muted-foreground">{t("reason")}: </span>
            {t(`reason_${r.reason}`)}
          </p>
          {ev.description ? (
            <p className="mt-1">{ev.description}</p>
          ) : (
            <p className="text-muted-foreground mt-1">{t("noDetails")}</p>
          )}
          {ev.photos && ev.photos.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
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
        </section>

        <section className="rounded-lg border p-4 text-sm">
          <h3 className="mb-2 font-medium">{t("sellerStatement")}</h3>
          {r.resolution ? (
            <p>{r.resolution}</p>
          ) : (
            <p className="text-muted-foreground">{t("noSellerStatement")}</p>
          )}
        </section>
      </div>

      {/* Thread */}
      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="font-medium">{t("thread")}</h3>
        {dispute.messages.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noMessages")}</p>
        ) : (
          <ul className="space-y-3">
            {dispute.messages.map((m) => (
              <li
                key={m.id}
                className={cn(
                  "rounded-md p-3 text-sm",
                  side(m.senderId) === "admin"
                    ? "bg-primary/5 border-primary/20 border"
                    : "bg-muted/50",
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium">{who(m.senderId)}</span>
                  <span className="text-muted-foreground text-xs">
                    {format.dateTime(m.createdAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                <p className="whitespace-pre-line">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
        <DisputeComposer disputeId={dispute.id} />
      </section>

      {/* Verdict */}
      {isActive ? (
        <DisputeVerdict disputeId={dispute.id} maxAmount={maxAmount} />
      ) : (
        <section className="rounded-lg border p-4">
          <h3 className="mb-1 font-medium">{t("verdictTitle")}</h3>
          <span
            className={cn(
              "mb-2 inline-block rounded px-1.5 py-0.5 text-xs font-medium",
              dispute.status === "RESOLVED_SELLER"
                ? "bg-emerald-500/15 text-emerald-600"
                : "bg-emerald-500/15 text-emerald-600",
            )}
          >
            {t(`status_${dispute.status}`)}
          </span>
          <p className="text-sm">{dispute.verdict}</p>
        </section>
      )}
    </div>
  );
}
