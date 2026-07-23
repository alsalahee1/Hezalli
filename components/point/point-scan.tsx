"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Keyboard, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  pointBuyerPickup,
  pointDriverManifest,
  pointHandoverManifest,
  pointHandoverParcel,
  pointReceiveParcel,
  pointReceiveReturn,
} from "@/lib/actions/point";
import type { ManifestRow } from "@/lib/point-core";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Minimal typing for the browser Barcode Detection API (not yet in lib.dom).
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts?: {
  formats?: string[];
}) => BarcodeDetectorLike;

// Pull the tracking token out of whatever the QR encoded: a full tracking URL
// (…/track/YE123) or a bare tracking number typed by hand.
function extractTracking(raw: string): string {
  const s = raw.trim();
  const m = s.match(/\/track\/([^/?#]+)/i);
  return decodeURIComponent(m ? m[1] : s);
}

// A driver's collection QR encodes "hezalli:driver:<userId>" (see the driver
// app's My-QR card).
const DRIVER_QR = /^hezalli:driver:([\w-]+)$/i;

export type ScanMode = "receive" | "handover" | "return" | "pickup";
type Driver = { id: string; name: string };
type Feedback = {
  ok: boolean;
  text: string;
  code: string;
  at: number;
};

// The point counter's scan station: pick what the scan MEANS (seller drop-off,
// courier collection, failed-delivery return), then scan parcels one after
// another. In handover mode, scanning a driver's collection QR selects that
// driver. Camera-less counters use the manual entry underneath.
export function PointScan({ drivers }: { drivers: Driver[] }) {
  const t = useTranslations("Point");
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const busyRef = useRef(false);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const [supported, setSupported] = useState<boolean | null>(null);
  const [scanning, setScanning] = useState(false);
  const [mode, setMode] = useState<ScanMode>("receive");
  const modeRef = useRef<ScanMode>("receive");
  const [driverId, setDriverId] = useState("");
  const driverRef = useRef("");
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [feed, setFeed] = useState<Feedback[]>([]);
  // The selected driver's pickup list at this hub (docs §26).
  const [manifest, setManifest] = useState<ManifestRow[] | null>(null);

  const loadManifest = async (id: string) => {
    if (!id) {
      setManifest(null);
      return;
    }
    const res = await pointDriverManifest(id);
    setManifest(res.rows ?? null);
  };

  const pickMode = (m: ScanMode) => {
    setMode(m);
    modeRef.current = m;
  };
  const pickDriver = (id: string) => {
    setDriverId(id);
    driverRef.current = id;
    void loadManifest(id);
  };

  const push = (ok: boolean, text: string, code: string) =>
    setFeed((f) => [{ ok, text, code, at: Date.now() }, ...f].slice(0, 8));

  // One scanned/typed code → one server action, per the current mode.
  const handle = async (raw: string) => {
    const driverMatch = raw.trim().match(DRIVER_QR);
    if (driverMatch) {
      if (drivers.some((d) => d.id === driverMatch[1])) {
        pickMode("handover");
        pickDriver(driverMatch[1]);
        push(true, t("driverSelected"), driverMatch[1].slice(-6));
      } else {
        push(false, t("err_invalidDriver"), driverMatch[1].slice(-6));
      }
      return;
    }

    const code = extractTracking(raw);
    if (!code) return;
    setBusy(true);
    try {
      const m = modeRef.current;
      // Pickup scans the BUYER's delivery QR/code, not the parcel label.
      if (m === "pickup") {
        const res = await pointBuyerPickup(code);
        if (res.ok) {
          push(
            true,
            res.codDue && res.codDue > 0
              ? t("pickupOkCod", { amount: `$${res.codDue.toFixed(2)}` })
              : t("pickupOk"),
            code,
          );
          router.refresh();
        } else {
          push(false, t(`err_${res.error ?? "notFound"}`), code);
        }
        return;
      }
      const res =
        m === "receive"
          ? await pointReceiveParcel(code)
          : m === "handover"
            ? await pointHandoverParcel(code, driverRef.current || undefined)
            : await pointReceiveReturn(code);
      if (res.ok) {
        push(
          true,
          m === "receive"
            ? t("receivedOk")
            : m === "handover"
              ? t("handedOk")
              : t("returnOk"),
          code,
        );
        if (m === "handover" && driverRef.current) {
          void loadManifest(driverRef.current);
        }
        router.refresh();
      } else {
        push(false, t(`err_${res.error ?? "notFound"}`), code);
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const Ctor = (
      window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }
    ).BarcodeDetector;
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) {
      setSupported(false);
      return;
    }
    setSupported(true);

    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const detector = new Ctor({ formats: ["qr_code"] });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (stopped) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setScanning(true);

        // Continuous scanning: process a code, then keep going. The same code
        // is ignored for a few seconds so one parcel isn't double-submitted.
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          if (!busyRef.current) {
            try {
              const codes = await detector.detect(videoRef.current);
              const raw = codes[0]?.rawValue;
              if (raw) {
                const now = Date.now();
                const last = lastRef.current;
                if (raw !== last.code || now - last.at > 4000) {
                  lastRef.current = { code: raw, at: now };
                  busyRef.current = true;
                  await handle(raw);
                  busyRef.current = false;
                }
              }
            } catch {
              // transient decode error — keep scanning
            }
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setSupported(false);
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const modes: { key: ScanMode; label: string }[] = [
    { key: "receive", label: t("modeReceive") },
    { key: "handover", label: t("modeHandover") },
    { key: "return", label: t("modeReturn") },
    { key: "pickup", label: t("modePickup") },
  ];

  return (
    <div className="space-y-4">
      {/* What does the next scan mean? */}
      <div className="grid grid-cols-4 gap-1 rounded-lg border p-1">
        {modes.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => pickMode(m.key)}
            className={cn(
              "rounded-md px-2 py-1.5 text-sm font-medium",
              mode === m.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "pickup" ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs">
          {t("pickupHint")}
        </p>
      ) : null}

      {mode === "handover" ? (
        <div className="space-y-1">
          <label className="text-sm font-medium">{t("driverLabel")}</label>
          <select
            value={driverId}
            onChange={(e) => pickDriver(e.target.value)}
            className="h-10 w-full rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="">{t("pickDriver")}</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">{t("scanDriverHint")}</p>

          {/* The driver's pickup list at this hub — hand it all over at once
              (docs §26). Per-parcel scanning below still works for partials. */}
          {driverId && manifest ? (
            manifest.length === 0 ? (
              <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs">
                {t("manifestEmpty")}
              </p>
            ) : (
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">
                  {t("manifestTitle", { count: manifest.length })}
                </p>
                <ul className="space-y-1">
                  {manifest.map((row) => (
                    <li
                      key={row.shipmentId}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate" dir="ltr">
                        {row.trackingNumber}
                      </span>
                      {row.city ? (
                        <span className="text-muted-foreground truncate text-xs">
                          {row.city}
                        </span>
                      ) : null}
                      {row.isCod ? (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-600">
                          COD
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  className="h-10 w-full"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const res = await pointHandoverManifest(driverId);
                      if (res.ok) {
                        push(
                          (res.failed ?? 0) === 0,
                          t("manifestDone", {
                            handed: res.handed ?? 0,
                            failed: res.failed ?? 0,
                          }),
                          `${res.handed ?? 0}`,
                        );
                        await loadManifest(driverId);
                        router.refresh();
                      } else {
                        push(false, t(`err_${res.error ?? "notFound"}`), "");
                      }
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy
                    ? t("saving")
                    : t("manifestHandAll", { count: manifest.length })}
                </Button>
              </div>
            )
          ) : null}
        </div>
      ) : null}

      {supported !== false ? (
        <div className="relative aspect-square w-full overflow-hidden rounded-xl border bg-black">
          <video
            ref={videoRef}
            className="size-full object-cover"
            muted
            playsInline
          />
          <div className="pointer-events-none absolute inset-8 overflow-hidden rounded-lg border-2 border-white/80">
            {scanning ? <span className="qr-scanline" /> : null}
          </div>
          {!scanning ? (
            <div className="text-muted-foreground absolute inset-0 flex items-center justify-center bg-black/40 text-sm text-white">
              <Camera className="me-2 size-5" /> {t("startingCamera")}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground flex items-center justify-center gap-2 text-center text-sm">
          <Camera className="size-4" /> {t("cameraUnavailable")}
        </p>
      )}

      {/* Manual fallback — always available. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = manual.trim();
          if (v && !busy) {
            setManual("");
            void handle(v);
          }
        }}
        className="space-y-2"
      >
        <label className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
          <Keyboard className="size-4" /> {t("enterTracking")}
        </label>
        <div className="flex gap-2">
          <Input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="YE123456789"
            dir="ltr"
            className="h-11"
          />
          <Button
            type="submit"
            className="h-11"
            disabled={!manual.trim() || busy}
          >
            {busy ? t("saving") : t("submitScan")}
          </Button>
        </div>
      </form>

      {/* Last few scans, newest first. */}
      {feed.length > 0 ? (
        <ul className="space-y-1.5">
          {feed.map((f) => (
            <li
              key={`${f.code}-${f.at}`}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                f.ok
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-red-500/40 bg-red-500/5",
              )}
            >
              {f.ok ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
              ) : (
                <XCircle className="size-4 shrink-0 text-red-600" />
              )}
              <span className="min-w-0 flex-1 truncate">{f.text}</span>
              <span className="text-muted-foreground text-xs" dir="ltr">
                {f.code}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
