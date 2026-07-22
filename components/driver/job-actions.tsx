"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, PackageCheck, Truck, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  courierAdvance,
  courierFailDelivery,
  type CourierAction,
} from "@/lib/actions/courier";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { CodeScanButton } from "@/components/driver/code-scan-button";

const FAIL_REASONS = [
  "unreachable",
  "refused",
  "wrong_address",
  "rescheduled",
  "other",
] as const;

// The driver's delivery controls: forward steps (picked up / out for delivery),
// a "Delivered" flow that captures proof (recipient + optional doorstep photo),
// and a "Couldn't deliver" flow that logs a failed attempt with a reason.
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
  const [sheet, setSheet] = useState<null | "deliver" | "fail">(null);

  // Proof-of-delivery state.
  const [recipient, setRecipient] = useState("");
  const [deliveryCode, setDeliveryCode] = useState("");
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Failed-attempt state.
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");

  const outForDelivery = status === "OUT_FOR_DELIVERY";
  const pickedUp = status === "PICKED_UP" || status === "OUT_FOR_DELIVERY";

  const step = (action: CourierAction) => {
    setErr(null);
    start(async () => {
      const res = await courierAdvance(shipmentId, action);
      if (res.error) setErr(res.error);
      else router.refresh();
    });
  };

  async function uploadPhoto(file: File) {
    setErr(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("folder", "proof");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        setErr("uploadFailed");
        return;
      }
      const data = (await res.json()) as { key?: string };
      if (data.key) setPhotoKey(data.key);
      else setErr("uploadFailed");
    } catch {
      setErr("uploadFailed");
    } finally {
      setUploading(false);
    }
  }

  const submitDeliver = () => {
    setErr(null);
    start(async () => {
      const res = await courierAdvance(shipmentId, "DELIVERED", {
        recipientName: recipient.trim() || undefined,
        photoKey: photoKey ?? undefined,
        deliveryCode: deliveryCode.trim() || undefined,
      });
      if (res.error) setErr(res.error);
      else router.push("/driver");
    });
  };

  const submitFail = () => {
    if (!reason) {
      setErr("badReason");
      return;
    }
    setErr(null);
    start(async () => {
      const res = await courierFailDelivery(
        shipmentId,
        reason,
        note.trim() || undefined,
      );
      if (res.error) setErr(res.error);
      else {
        setSheet(null);
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-3">
      {!pickedUp ? (
        <button
          disabled={pending}
          onClick={() => step("PICKED_UP")}
          className="flex w-full items-center justify-center gap-2 rounded-xl border py-3 font-medium disabled:opacity-50"
        >
          <Truck className="size-5" /> {t("markPickedUp")}
        </button>
      ) : null}

      {!outForDelivery ? (
        <button
          disabled={pending}
          onClick={() => step("OUT_FOR_DELIVERY")}
          className="flex w-full items-center justify-center gap-2 rounded-xl border py-3 font-medium disabled:opacity-50"
        >
          <Truck className="size-5" />{" "}
          {status === "FAILED" ? t("retryDelivery") : t("markOutForDelivery")}
        </button>
      ) : null}

      <button
        disabled={pending}
        onClick={() => {
          setErr(null);
          setSheet("deliver");
        }}
        className="bg-primary text-primary-foreground flex w-full items-center justify-center gap-2 rounded-xl py-4 text-base font-semibold disabled:opacity-50"
      >
        <PackageCheck className="size-5" /> {t("markDelivered")}
      </button>

      <button
        disabled={pending}
        onClick={() => {
          setErr(null);
          setReason("");
          setNote("");
          setSheet("fail");
        }}
        className="text-muted-foreground hover:text-foreground flex w-full items-center justify-center gap-2 py-2 text-sm font-medium disabled:opacity-50"
      >
        <XCircle className="size-4" /> {t("couldntDeliver")}
      </button>

      {err && !sheet ? (
        <p className="text-destructive text-center text-sm">{errMsg(t, err)}</p>
      ) : null}

      {/* Proof-of-delivery sheet */}
      {sheet === "deliver" ? (
        <Sheet
          onClose={() => !pending && setSheet(null)}
          title={t("deliverTitle")}
        >
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t("recipientName")}</span>
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder={t("recipientHint")}
              className="border-input focus-visible:border-primary w-full rounded-lg border bg-transparent px-3 py-2.5 text-sm outline-none"
            />
          </label>

          {/* Optional strongest proof: the code under the buyer's delivery QR.
              The driver can scan the buyer's QR (fills this) or type it. */}
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t("deliveryCode")}</span>
            <input
              value={deliveryCode}
              onChange={(e) => setDeliveryCode(e.target.value)}
              placeholder={t("deliveryCodeHint")}
              dir="ltr"
              autoCapitalize="characters"
              className="border-input focus-visible:border-primary w-full rounded-lg border bg-transparent px-3 py-2.5 text-sm uppercase outline-none"
            />
          </label>
          <CodeScanButton
            onScan={(code) => {
              setErr(null);
              setDeliveryCode(code);
            }}
          />

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadPhoto(f);
            }}
          />
          <button
            type="button"
            disabled={uploading || pending}
            onClick={() => fileRef.current?.click()}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm font-medium disabled:opacity-50",
              photoKey && "border-emerald-500/50 text-emerald-600",
            )}
          >
            <Camera className="size-4" />
            {uploading
              ? t("uploading")
              : photoKey
                ? t("photoAdded")
                : t("addPhoto")}
          </button>

          {err ? (
            <p className="text-destructive text-sm">{errMsg(t, err)}</p>
          ) : null}

          <div className="flex gap-2 pt-1">
            <button
              disabled={pending}
              onClick={() => setSheet(null)}
              className="flex-1 rounded-lg border py-3 text-sm font-medium disabled:opacity-50"
            >
              {t("cancel")}
            </button>
            <button
              disabled={pending || uploading}
              onClick={submitDeliver}
              className="bg-primary text-primary-foreground flex-[2] rounded-lg py-3 text-sm font-semibold disabled:opacity-50"
            >
              {pending ? t("saving") : t("confirmDeliverBtn")}
            </button>
          </div>
        </Sheet>
      ) : null}

      {/* Failed-attempt sheet */}
      {sheet === "fail" ? (
        <Sheet
          onClose={() => !pending && setSheet(null)}
          title={t("failTitle")}
        >
          <div className="space-y-1.5">
            {FAIL_REASONS.map((r) => (
              <label
                key={r}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm",
                  reason === r ? "border-primary bg-primary/5" : "border-input",
                )}
              >
                <input
                  type="radio"
                  name="failReason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="size-4"
                />
                {t(`failReason_${r}`)}
              </label>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={t("failNote")}
            className="border-input focus-visible:border-primary w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
          />
          {err ? (
            <p className="text-destructive text-sm">{errMsg(t, err)}</p>
          ) : null}
          <div className="flex gap-2 pt-1">
            <button
              disabled={pending}
              onClick={() => setSheet(null)}
              className="flex-1 rounded-lg border py-3 text-sm font-medium disabled:opacity-50"
            >
              {t("cancel")}
            </button>
            <button
              disabled={pending}
              onClick={submitFail}
              className="flex-[2] rounded-lg bg-amber-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending ? t("saving") : t("submitFail")}
            </button>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

// Known error keys have friendly messages; anything else falls back generically.
function errMsg(t: ReturnType<typeof useTranslations>, key: string): string {
  const known = new Set([
    "forbidden",
    "notFound",
    "badState",
    "badReason",
    "badCode",
    "uploadFailed",
    "proofRequired",
  ]);
  return known.has(key) ? t(`err_${key}`) : t("err_badState");
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div className="bg-background relative w-full max-w-md space-y-3 rounded-t-2xl border p-4 shadow-lg sm:rounded-2xl">
        <h2 className="text-base font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
