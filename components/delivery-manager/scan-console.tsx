"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Keyboard, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  lookupShipmentForScan,
  overrideShipmentStatus,
  type OverrideStatus,
} from "@/lib/actions/shipment-admin";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts?: {
  formats?: string[];
}) => BarcodeDetectorLike;

// The statuses a hub scan typically applies, as fast one-tap "modes". Scanning
// a parcel applies the selected status to it — like a J&T hub scan gun.
const MODES: OverrideStatus[] = [
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
  "RETURNED",
];

// Pull the tracking token out of a QR/URL or accept a bare code.
function extractCode(raw: string): string {
  const s = raw.trim();
  const m = s.match(/\/track\/([^/?#]+)/i);
  return decodeURIComponent(m ? m[1] : s);
}

type Feedback = { ok: boolean; text: string; code: string; at: number };

// Delivery-manager scan station: pick the status a scan means, then scan (or
// type) parcels one after another to apply it. Each scan looks the shipment up
// and applies the status through the same audited override used elsewhere.
export function ScanConsole() {
  const t = useTranslations("DeliveryManager");
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const busyRef = useRef(false);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const modeRef = useRef<OverrideStatus>("IN_TRANSIT");
  const [mode, setMode] = useState<OverrideStatus>("IN_TRANSIT");
  const [supported, setSupported] = useState<boolean | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [feed, setFeed] = useState<Feedback[]>([]);

  const pickMode = (m: OverrideStatus) => {
    setMode(m);
    modeRef.current = m;
  };
  const push = (ok: boolean, text: string, code: string) =>
    setFeed((f) => [{ ok, text, code, at: Date.now() }, ...f].slice(0, 10));

  const handle = async (raw: string) => {
    const code = extractCode(raw);
    if (!code) return;
    setBusy(true);
    try {
      const found = await lookupShipmentForScan(code);
      if (!found.ok) {
        push(false, t(`error_${found.error ?? "notFound"}`), code);
        return;
      }
      const m = modeRef.current;
      if (found.shipment.status === m) {
        push(
          true,
          `${found.shipment.code} · ${t(`shipStatus_${m}`)}`,
          found.shipment.buyer,
        );
        return;
      }
      const res = await overrideShipmentStatus(found.shipment.id, m);
      if (res.error) {
        push(
          false,
          `${found.shipment.code} · ${t(`error_${res.error}`)}`,
          code,
        );
      } else {
        push(
          true,
          `${found.shipment.code} → ${t(`shipStatus_${m}`)}`,
          found.shipment.buyer,
        );
        router.refresh();
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
    // Waybills print a Code 39 barcode; buyer QR proofs are qr_code.
    const detector = new Ctor({ formats: ["qr_code", "code_39"] });

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

  return (
    <div className="space-y-4 md:grid md:grid-cols-2 md:items-start md:gap-6 md:space-y-0">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => pickMode(m)}
              className={cn(
                "min-h-10 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors",
                mode === m
                  ? "bg-primary text-primary-foreground border-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`shipStatus_${m}`)}
            </button>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">{t("scanModeHint")}</p>

        {supported === false ? (
          <div className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
            <Camera className="mb-1 inline size-4" /> {t("scanNoCamera")}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-black">
            <video
              ref={videoRef}
              className="mx-auto max-h-72 w-full object-contain"
              muted
              playsInline
            />
          </div>
        )}

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = manual.trim();
            if (v) {
              setManual("");
              void handle(v);
            }
          }}
        >
          <div className="relative flex-1">
            <Keyboard className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2" />
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder={t("scanManual")}
              className="ps-9"
              dir="ltr"
            />
          </div>
          <Button type="submit" disabled={busy}>
            {t("apply")}
          </Button>
        </form>
      </div>

      {feed.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {feed.map((f) => (
            <li
              key={f.at}
              className="flex items-center gap-2 px-3 py-2 text-sm"
            >
              {f.ok ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
              ) : (
                <XCircle className="text-destructive size-4 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate">{f.text}</span>
              <span className="text-muted-foreground truncate text-xs">
                {f.code}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
