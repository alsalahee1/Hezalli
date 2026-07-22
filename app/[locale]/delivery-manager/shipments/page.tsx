import { getFormatter, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  ShipmentBulkList,
  type ShipmentRow,
} from "@/components/delivery-manager/shipment-bulk-list";

export const dynamic = "force-dynamic";

const STATUSES = [
  "PENDING",
  "LABEL_CREATED",
  "PICKED_UP",
  "IN_TRANSIT",
  "AT_POINT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
  "RETURNED_TO_POINT",
  "RETURNED",
] as const;

const STUCK_DAYS = 7;
const PAGE_SIZE = 50;

export default async function DeliveryManagerShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    stuck?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const t = await getTranslations("DeliveryManager");
  const format = await getFormatter();
  const { status, stuck, q, page } = await searchParams;
  const query = q?.trim() || "";
  const pageNum = Math.max(1, Number(page) || 1);
  const activeStatus = STATUSES.includes(status as never) ? status : undefined;

  const shipments = await prisma.shipment.findMany({
    where: {
      ...(activeStatus ? { status: activeStatus as never } : {}),
      ...(stuck === "1"
        ? {
            status: {
              in: ["PENDING", "LABEL_CREATED", "PICKED_UP", "IN_TRANSIT"],
            },
            updatedAt: { lt: new Date(Date.now() - STUCK_DAYS * 86_400_000) },
          }
        : {}),
      ...(query
        ? {
            OR: [
              { trackingNumber: { contains: query, mode: "insensitive" } },
              {
                subOrder: {
                  order: {
                    buyer: { name: { contains: query, mode: "insensitive" } },
                  },
                },
              },
              {
                subOrder: {
                  store: { name: { contains: query, mode: "insensitive" } },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: PAGE_SIZE + 1, // one extra row = "there is a next page"
    skip: (pageNum - 1) * PAGE_SIZE,
    select: {
      id: true,
      status: true,
      trackingNumber: true,
      platformManaged: true,
      updatedAt: true,
      carrier: { select: { name: true } },
      driver: { select: { name: true } },
      subOrder: {
        select: {
          id: true,
          store: { select: { name: true } },
          order: {
            select: {
              buyer: { select: { name: true } },
              address: { select: { governorate: true } },
            },
          },
        },
      },
    },
  });

  const hasNext = shipments.length > PAGE_SIZE;
  const rows: ShipmentRow[] = shipments.slice(0, PAGE_SIZE).map((s) => ({
    id: s.id,
    code: `#${s.subOrder.id.slice(-8).toUpperCase()}`,
    storeName: s.subOrder.store.name,
    platformManaged: s.platformManaged,
    metaLine: [
      s.subOrder.order.buyer.name ?? "—",
      s.subOrder.order.address.governorate,
      s.carrier?.name,
      s.driver ? `🛵 ${s.driver.name ?? ""}` : null,
      s.trackingNumber,
    ]
      .filter(Boolean)
      .join(" · "),
    status: s.status,
    updatedLabel: format.dateTime(s.updatedAt, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
  }));
  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (activeStatus) sp.set("status", activeStatus);
    if (stuck === "1") sp.set("stuck", "1");
    if (query) sp.set("q", query);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return `/delivery-manager/shipments${qs ? `?${qs}` : ""}`;
  };

  const filterLink = (href: string, label: string, active: boolean) => (
    <Link
      key={href}
      href={href}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("shipments")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("shipmentsDesc")}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {filterLink(
          "/delivery-manager/shipments",
          t("all"),
          !activeStatus && stuck !== "1",
        )}
        {filterLink(
          "/delivery-manager/shipments?stuck=1",
          t("stuck"),
          stuck === "1",
        )}
        {STATUSES.map((s) =>
          filterLink(
            `/delivery-manager/shipments?status=${s}`,
            t(`shipStatus_${s}`),
            activeStatus === s,
          ),
        )}
      </div>

      <form className="flex max-w-md gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder={t("searchPlaceholder")}
          className="border-input bg-background h-9 flex-1 rounded-md border px-3 text-sm"
        />
        <button
          type="submit"
          className="bg-primary text-primary-foreground h-9 rounded-md px-4 text-sm font-medium"
        >
          {t("search")}
        </button>
      </form>

      <a
        href={`/api/delivery-manager/export?${new URLSearchParams({
          ...(activeStatus ? { status: activeStatus } : {}),
          ...(stuck === "1" ? { stuck: "1" } : {}),
          ...(query ? { q: query } : {}),
        }).toString()}`}
        className="text-primary inline-block text-sm font-medium hover:underline"
        download
      >
        {t("exportCsv")}
      </a>

      {rows.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
          {t("shipmentsEmpty")}
        </div>
      ) : (
        <ShipmentBulkList rows={rows} />
      )}

      {pageNum > 1 || hasNext ? (
        <div className="flex items-center justify-between text-sm">
          {pageNum > 1 ? (
            <Link
              href={pageHref(pageNum - 1)}
              className="text-primary font-medium hover:underline"
            >
              ← {t("prevPage")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground text-xs">
            {t("pageLabel", { page: pageNum })}
          </span>
          {hasNext ? (
            <Link
              href={pageHref(pageNum + 1)}
              className="text-primary font-medium hover:underline"
            >
              {t("nextPage")} →
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </div>
  );
}
