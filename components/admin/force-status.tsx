"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { forceOrderStatus } from "@/lib/actions/admin-oversight";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
];

export function ForceStatus({
  orderId,
  current,
}: {
  orderId: string;
  current: string;
}) {
  const t = useTranslations("AdminOrders");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(current);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const submit = () =>
    start(async () => {
      setErr(null);
      const res = await forceOrderStatus(orderId, status, note);
      if (res.error) setErr(res.error);
      else {
        setOpen(false);
        setNote("");
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
        {t("forceStatus")}
      </Button>
      {open ? (
        <div className="flex flex-col items-end gap-2">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-56"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status_${s}`)}
              </option>
            ))}
          </Select>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("forceNote")}
            className="w-56"
          />
          <Button
            size="sm"
            disabled={pending || status === current}
            onClick={submit}
          >
            {t("apply")}
          </Button>
          {err ? (
            <p className="text-destructive text-xs">{t(`err_${err}`)}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
