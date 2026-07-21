import { getFormatter, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

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

const STATUS_TONE: Record<string, string> = {
  DELIVERED: "bg-emerald-500/10 text-emerald-600",
  FAILED: "bg-destructive/10 text-destructive",
  RETURNED: "bg-destructive/10 text-destructive",
  IN_TRANSIT: "bg-sky-500/10 text-sky-600",
  AT_POINT: "bg-violet-500/10 text-violet-600",
  OUT_FOR_DELIVERY: "bg-sky-500/10 text-sky-600",
  RETURNED_TO_POINT: "bg-destructive/10 text-destructive",
};

const STUCK_DAYS = 7;

export default async function DeliveryManagerShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; stuck?: string; q?: string }>;
}) {
  const t = await getTranslations("DeliveryManager");
  const format = await getFormatter();
  const { status, stuck, q } = await searchParams;
  const query = q?.trim() || "";
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
    take: 100,
    select: {
      id: true,
      status: true,
      trackingNumber: true,
      platformManaged: true,
      updatedAt: true,
      carrier: { select: { name: true } },
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

      {shipments.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
          {t("shipmentsEmpty")}
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {shipments.map((s) => (
            <li key={s.id}>
              <Link
                href={`/delivery-manager/shipments/${s.id}`}
                className="hover:bg-muted/50 flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    #{s.subOrder.id.slice(-8).toUpperCase()} ·{" "}
                    {s.subOrder.store.name}
                    {s.platformManaged ? (
                      <span className="bg-primary/10 text-primary ms-2 rounded-full px-2 py-0.5 text-xs font-medium">
                        {t("platformManaged")}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {s.subOrder.order.buyer.name ?? "—"} ·{" "}
                    {s.subOrder.order.address.governorate}
                    {s.carrier ? ` · ${s.carrier.name}` : ""}
                    {s.trackingNumber ? ` · ${s.trackingNumber}` : ""}
                  </p>
                </div>
                <div className="text-end">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      STATUS_TONE[s.status] ?? "bg-muted text-muted-foreground",
                    )}
                  >
                    {t(`shipStatus_${s.status}`)}
                  </span>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {format.dateTime(s.updatedAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
