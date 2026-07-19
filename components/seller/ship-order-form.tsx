"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Truck } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  editTracking,
  markDelivered,
  shipSubOrder,
} from "@/lib/actions/shipment";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type CarrierOption = { id: string; name: string };
export type ShipmentInfo = {
  carrierId: string | null;
  carrierName: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
} | null;

export function ShipOrderForm({
  subOrderId,
  status,
  carriers,
  shipment,
  shippingMethod = "STANDARD",
  preferredCarrierId = null,
}: {
  subOrderId: string;
  status: string;
  carriers: CarrierOption[];
  shipment: ShipmentInfo;
  shippingMethod?: "STANDARD" | "EXPRESS";
  preferredCarrierId?: string | null;
}) {
  const t = useTranslations("Shipment");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [carrierId, setCarrierId] = useState(
    shipment?.carrierId ?? preferredCarrierId ?? carriers[0]?.id ?? "",
  );
  const [tracking, setTracking] = useState(shipment?.trackingNumber ?? "");
  const [note, setNote] = useState("");

  const submit = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setErr(null);
      const res = await fn();
      if (res.error) setErr(res.error);
      else {
        setEditing(false);
        router.refresh();
      }
    });

  const carrierSelect = (
    <select
      value={carrierId}
      onChange={(e) => setCarrierId(e.target.value)}
      className="h-9 rounded-md border bg-transparent px-3 text-sm"
    >
      {carriers.length === 0 ? <option value="">—</option> : null}
      {carriers.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );

  const errLine = err ? (
    <p className="text-destructive text-xs">{t(`err_${err}`)}</p>
  ) : null;

  // Ship (order is being prepared).
  if (status === "PROCESSING") {
    return (
      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Truck className="size-4" /> {t("shipTitle")}
        </h3>
        {shippingMethod === "EXPRESS" ? (
          <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-500">
            {t("expressChosen")}
          </p>
        ) : null}
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium">
            {t("carrier")}
            {carrierSelect}
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            {t("trackingNumber")}
            <Input
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="YE123456789"
              className="h-9 w-48"
              dir="ltr"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium">
          {t("note")}
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("notePlaceholder")}
            className="h-9 max-w-md"
          />
        </label>
        {errLine}
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            submit(() =>
              shipSubOrder(subOrderId, {
                carrierId,
                trackingNumber: tracking,
                note,
              }),
            )
          }
        >
          {pending ? t("shipping") : t("markShipped")}
        </Button>
      </section>
    );
  }

  // Shipped / delivered — show tracking, allow editing while SHIPPED.
  if (!shipment) return null;
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Truck className="size-4" /> {t("shipmentTitle")}
      </h3>
      {!editing ? (
        <div className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">{t("carrier")}: </span>
            {shipment.carrierName ?? "—"}
          </p>
          <p className="flex items-center gap-2">
            <span className="text-muted-foreground">
              {t("trackingNumber")}:{" "}
            </span>
            <span dir="ltr">{shipment.trackingNumber ?? "—"}</span>
            {shipment.trackingUrl ? (
              <a
                href={shipment.trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary inline-flex items-center gap-1 hover:underline"
              >
                {t("track")} <ExternalLink className="size-3.5" />
              </a>
            ) : null}
          </p>
          {status === "SHIPPED" ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={pending}
                onClick={() => submit(() => markDelivered(subOrderId))}
              >
                {t("markDelivered")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => setEditing(true)}
              >
                {t("editTracking")}
              </Button>
            </div>
          ) : null}
          {errLine}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium">
              {t("carrier")}
              {carrierSelect}
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              {t("trackingNumber")}
              <Input
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                className="h-9 w-48"
                dir="ltr"
              />
            </label>
          </div>
          {errLine}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                submit(() =>
                  editTracking(subOrderId, {
                    carrierId,
                    trackingNumber: tracking,
                  }),
                )
              }
            >
              {pending ? t("saving") : t("save")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setEditing(false)}
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
