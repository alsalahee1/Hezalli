"use client";

import { useState, useTransition } from "react";
import { PackageCheck, Truck } from "lucide-react";
import { useTranslations } from "next-intl";

import { courierAdvance, type CourierAction } from "@/lib/actions/courier";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// The driver's forward-only controls. "Out for delivery" is offered until the
// parcel is out; "Delivered" is always the primary terminal action.
export function JobActions({
  shipmentId,
  status,
}: {
  shipmentId: string;
  status: string;
}) {
  const t = useTranslations("Driver");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const run = (action: CourierAction, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setErr(null);
    start(async () => {
      const res = await courierAdvance(shipmentId, action);
      if (res.error) setErr(res.error);
      else {
        if (action === "DELIVERED") router.push("/driver");
        else router.refresh();
      }
    });
  };

  const outForDelivery = status === "OUT_FOR_DELIVERY";

  return (
    <div className="space-y-3">
      {status !== "PICKED_UP" && status !== "OUT_FOR_DELIVERY" ? (
        <button
          disabled={pending}
          onClick={() => run("PICKED_UP")}
          className="flex w-full items-center justify-center gap-2 rounded-xl border py-3 font-medium disabled:opacity-50"
        >
          <Truck className="size-5" /> {t("markPickedUp")}
        </button>
      ) : null}

      {!outForDelivery ? (
        <button
          disabled={pending}
          onClick={() => run("OUT_FOR_DELIVERY")}
          className="flex w-full items-center justify-center gap-2 rounded-xl border py-3 font-medium disabled:opacity-50"
        >
          <Truck className="size-5" /> {t("markOutForDelivery")}
        </button>
      ) : null}

      <button
        disabled={pending}
        onClick={() => run("DELIVERED", t("confirmDelivered"))}
        className={cn(
          "bg-primary text-primary-foreground flex w-full items-center justify-center gap-2 rounded-xl py-4 text-base font-semibold disabled:opacity-50",
        )}
      >
        <PackageCheck className="size-5" />
        {pending ? t("saving") : t("markDelivered")}
      </button>

      {err ? (
        <p className="text-destructive text-center text-sm">
          {t(`err_${err}`)}
        </p>
      ) : null}
    </div>
  );
}
