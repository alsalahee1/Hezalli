"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, QrCode as QrIcon, ScanLine, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReferralLink } from "@/components/account/referral-link";

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

// Pull a Hezalli pay target out of whatever the QR encoded — a full pay URL
// (…/en/pay/u/<id> or …/pay/r/<id>) or a pasted "u/<id>" / bare id. Returns a
// locale-agnostic path the i18n router can push, or null if it isn't ours.
export function extractPayPath(raw: string): string | null {
  const s = raw.trim();
  const m = s.match(/\/?pay\/(u|r)\/([^/?#\s]+)/i);
  if (m) return `/pay/${m[1].toLowerCase()}/${decodeURIComponent(m[2])}`;
  const short = s.match(/^(u|r)\/([^/?#\s]+)$/i);
  if (short)
    return `/pay/${short[1].toLowerCase()}/${decodeURIComponent(short[2])}`;
  return null;
}

type Mode = "pay" | "receive";

/**
 * Full-screen scan-and-pay sheet reached from the wallet bar's center button.
 * "Scan to pay" reads another user's or merchant's Hezalli pay QR and jumps to
 * the pay screen; "My code" shows the user's own QR so others can pay them.
 */
export function WalletScanSheet({
  open,
  onClose,
  myQr,
  myPayUrl,
}: {
  open: boolean;
  onClose: () => void;
  myQr: React.ReactNode;
  myPayUrl: string;
}) {
  const t = useTranslations("WalletScan");
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("pay");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);

  const go = (raw: string) => {
    const path = extractPayPath(raw);
    if (!path) {
      setError("notAPayCode");
      return;
    }
    onClose();
    router.push(path);
  };

  // Camera runs only while the sheet is open and on the "pay" tab.
  useEffect(() => {
    if (!open || mode !== "pay") return;
    setError(null);
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

        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const hit = codes.find((c) => extractPayPath(c.rawValue));
            if (hit) {
              stopped = true;
              go(hit.rawValue);
              return;
            }
          } catch {
            // transient decode error — keep scanning
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
      setScanning(false);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  if (!open) return null;

  const tabClass = (active: boolean) =>
    cn(
      "flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <span className="font-semibold">{t("title")}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="hover:bg-muted rounded-md p-1"
        >
          <X className="size-5" />
        </button>
      </header>

      <div className="p-4">
        <div className="bg-muted/60 mx-auto flex max-w-sm rounded-full p-1">
          <button
            type="button"
            onClick={() => setMode("pay")}
            className={tabClass(mode === "pay")}
          >
            <ScanLine className="size-4" /> {t("payTab")}
          </button>
          <button
            type="button"
            onClick={() => setMode("receive")}
            className={tabClass(mode === "receive")}
          >
            <QrIcon className="size-4" /> {t("receiveTab")}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {mode === "pay" ? (
          <div className="mx-auto max-w-sm space-y-4">
            {supported !== false ? (
              <div className="relative aspect-square w-full overflow-hidden rounded-2xl border bg-black">
                <video
                  ref={videoRef}
                  className="size-full object-cover"
                  muted
                  playsInline
                />
                <div className="pointer-events-none absolute inset-10 rounded-xl border-2 border-white/80" />
                {!scanning ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm text-white">
                    <Camera className="me-2 size-5" /> {t("starting")}
                  </div>
                ) : null}
              </div>
            ) : null}

            <p className="text-muted-foreground flex items-center justify-center gap-2 text-center text-sm">
              <Camera className="size-4" />
              {supported === false ? t("cameraUnavailable") : t("scanHint")}
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (manual.trim()) go(manual);
              }}
              className="space-y-2"
            >
              <label className="text-muted-foreground text-sm font-medium">
                {t("manualLabel")}
              </label>
              <div className="flex gap-2">
                <Input
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  placeholder="u/…"
                  dir="ltr"
                  className="h-11"
                />
                <Button
                  type="submit"
                  className="h-11"
                  disabled={!manual.trim()}
                >
                  {t("go")}
                </Button>
              </div>
            </form>

            {error ? (
              <p className="text-destructive text-center text-sm">{t(error)}</p>
            ) : null}
          </div>
        ) : (
          <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-2">
            <div className="rounded-2xl border bg-white p-4">{myQr}</div>
            <p className="text-muted-foreground max-w-xs text-center text-sm">
              {t("receiveHint")}
            </p>
            <div className="w-full">
              <ReferralLink
                url={myPayUrl}
                copyLabel={t("copyLink")}
                copiedLabel={t("copied")}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
