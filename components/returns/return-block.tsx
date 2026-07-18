"use client";

import { useState, useTransition } from "react";
import { RotateCcw, X } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  addReturnTracking,
  escalateReturn,
  requestReturn,
} from "@/lib/actions/return";
import { RETURN_REASONS, type ReturnType } from "@/lib/returns";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageUploader } from "@/components/upload/image-uploader";

export type ReturnView = {
  id: string;
  status: string;
  reason: string;
  resolution: string | null;
  type: ReturnType;
  description: string;
  returnAddress: string | null;
  returnTracking: string | null;
  hasDispute: boolean;
} | null;

const BADGE: Record<string, string> = {
  REQUESTED: "bg-amber-500/15 text-amber-600",
  APPROVED: "bg-blue-500/15 text-blue-600",
  IN_TRANSIT: "bg-indigo-500/15 text-indigo-600",
  RECEIVED: "bg-blue-500/15 text-blue-600",
  REJECTED: "bg-destructive/10 text-destructive",
  REFUNDED: "bg-emerald-500/15 text-emerald-600",
  CLOSED: "bg-muted text-muted-foreground",
};

export function ReturnBlock({
  subOrderId,
  canRequest,
  ret,
}: {
  subOrderId: string;
  canRequest: boolean;
  ret: ReturnView;
}) {
  const t = useTranslations("Returns");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Request form state
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(RETURN_REASONS[0]);
  const [type, setType] = useState<ReturnType>("return_and_refund");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [tracking, setTracking] = useState("");

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setErr(null);
      const res = await fn();
      if (res.error) setErr(res.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });

  // ---- Existing return: status + buyer actions -----------------------------
  if (ret) {
    return (
      <div className="border-t p-4 text-sm">
        <div className="mb-2 flex items-center gap-2">
          <RotateCcw className="size-4" />
          <span className="font-medium">{t("returnTitle")}</span>
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-xs font-medium",
              BADGE[ret.status] ?? "bg-muted",
            )}
          >
            {t(`status_${ret.status}`)}
          </span>
          {ret.hasDispute ? (
            <span className="bg-destructive/10 text-destructive rounded px-1.5 py-0.5 text-xs font-medium">
              {t("escalated")}
            </span>
          ) : null}
        </div>

        <p className="text-muted-foreground">
          {t(`reason_${ret.reason}`)} · {t(`type_${ret.type}`)}
        </p>
        {ret.resolution ? (
          <p className="text-muted-foreground mt-1">{ret.resolution}</p>
        ) : null}

        {ret.status === "APPROVED" && ret.type === "return_and_refund" ? (
          <div className="mt-3 space-y-2">
            {ret.returnAddress ? (
              <p>
                <span className="text-muted-foreground">
                  {t("returnAddress")}:{" "}
                </span>
                {ret.returnAddress}
              </p>
            ) : null}
            <div className="flex flex-wrap items-end gap-2">
              <Input
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                placeholder={t("trackingPlaceholder")}
                className="h-9 w-48"
                dir="ltr"
              />
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => addReturnTracking(ret.id, tracking))}
              >
                {t("submitTracking")}
              </Button>
            </div>
          </div>
        ) : null}

        {ret.returnTracking ? (
          <p className="mt-1">
            <span className="text-muted-foreground">{t("yourTracking")}: </span>
            <span dir="ltr">{ret.returnTracking}</span>
          </p>
        ) : null}

        {!ret.hasDispute &&
        ret.status !== "REFUNDED" &&
        ret.status !== "CLOSED" ? (
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            disabled={pending}
            onClick={() => run(() => escalateReturn(ret.id))}
          >
            {t("escalate")}
          </Button>
        ) : null}

        {err ? (
          <p className="text-destructive mt-2 text-xs">{t(`err_${err}`)}</p>
        ) : null}
      </div>
    );
  }

  // ---- No return yet: request form -----------------------------------------
  if (!canRequest) return null;

  if (!open) {
    return (
      <div className="border-t p-4">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <RotateCcw className="size-4" /> {t("requestReturn")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t p-4 text-sm">
      <p className="font-medium">{t("requestReturn")}</p>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">{t("reasonLabel")}</span>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="h-9 rounded-md border bg-transparent px-3"
        >
          {RETURN_REASONS.map((r) => (
            <option key={r} value={r}>
              {t(`reason_${r}`)}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium">{t("typeLabel")}</span>
        <div className="flex gap-4">
          {(["return_and_refund", "refund_only"] as ReturnType[]).map((tp) => (
            <label key={tp} className="flex items-center gap-2">
              <input
                type="radio"
                name="rtype"
                className="size-4"
                checked={type === tp}
                onChange={() => setType(tp)}
              />
              {t(`type_${tp}`)}
            </label>
          ))}
        </div>
      </div>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder={t("descriptionPlaceholder")}
        className="w-full rounded-md border bg-transparent p-2 text-sm outline-none"
      />

      <div className="flex flex-wrap items-center gap-2">
        {photos.map((url) => (
          <div
            key={url}
            className="relative size-16 overflow-hidden rounded border"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => setPhotos((p) => p.filter((u) => u !== url))}
              className="absolute end-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
              aria-label={t("removePhoto")}
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        {photos.length < 5 ? (
          <ImageUploader
            folder="products"
            label={t("addPhoto")}
            onUploaded={(url) => setPhotos((p) => [...p, url].slice(0, 5))}
          />
        ) : null}
      </div>

      {err ? (
        <p className="text-destructive text-xs">{t(`err_${err}`)}</p>
      ) : null}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            run(() =>
              requestReturn({
                subOrderId,
                reason,
                description,
                photos,
                type,
              }),
            )
          }
        >
          {t("submitRequest")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
