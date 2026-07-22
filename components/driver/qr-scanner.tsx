"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Keyboard } from "lucide-react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
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

export function QrScanner() {
  const t = useTranslations("Driver");
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);

  const go = (raw: string) => {
    const code = extractTracking(raw);
    if (code) router.push(`/driver/t/${encodeURIComponent(code)}`);
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

        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0 && codes[0].rawValue) {
              stopped = true;
              go(codes[0].rawValue);
              return;
            }
          } catch {
            // transient decode error — keep scanning
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setError("camera");
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
    <div className="space-y-4">
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
      ) : null}

      <p className="text-muted-foreground flex items-center justify-center gap-2 text-center text-sm">
        <Camera className="size-4" />
        {supported === false ? t("cameraUnavailable") : t("scanHint")}
      </p>

      {/* Manual fallback — always available. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) go(manual);
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
          <Button type="submit" className="h-11" disabled={!manual.trim()}>
            {t("open")}
          </Button>
        </div>
      </form>

      {error ? (
        <p className="text-destructive text-center text-sm">
          {t("cameraUnavailable")}
        </p>
      ) : null}
    </div>
  );
}
