"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, QrCode, X } from "lucide-react";
import { useTranslations } from "next-intl";

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

// The buyer's delivery QR encodes their raw delivery code (e.g. "AB12CD"), not a
// URL — so we hand the scanned value straight back, normalized to match how the
// code is stored/compared (trimmed, upper-cased).
function extractCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Doorstep "Scan customer QR" control for the Delivered flow. Opens the rear
 * camera, reads the buyer's delivery-code QR, and returns the code via onScan.
 * Renders nothing when the Barcode Detection API isn't available — the manual
 * code field remains the fallback in that case.
 */
export function CodeScanButton({ onScan }: { onScan: (code: string) => void }) {
  const t = useTranslations("Driver");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detect API support once, on mount, so we can hide the button where the
  // camera path can never work.
  useEffect(() => {
    const Ctor = (
      window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }
    ).BarcodeDetector;
    setSupported(!!Ctor && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  // Camera runs only while the overlay is open.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setScanning(false);
    const Ctor = (
      window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }
    ).BarcodeDetector;
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) {
      setError("camera");
      return;
    }

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
              onScan(extractCode(codes[0].rawValue));
              setOpen(false);
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
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (supported === false) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border py-3 text-sm font-medium"
      >
        <QrCode className="size-4" /> {t("scanCustomerQr")}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black">
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <span className="text-sm font-medium">{t("scanCustomerQr")}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("cancel")}
              className="flex size-11 items-center justify-center rounded-md hover:bg-white/10"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="relative flex-1">
            <video
              ref={videoRef}
              className="size-full object-cover"
              muted
              playsInline
            />
            <div className="pointer-events-none absolute inset-[15%] overflow-hidden rounded-2xl border-2 border-white/80">
              {scanning ? <span className="qr-scanline" /> : null}
            </div>
            {!scanning && !error ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm text-white">
                <Camera className="me-2 size-5" /> {t("startingCamera")}
              </div>
            ) : null}
            {error ? (
              <div className="absolute inset-x-0 bottom-8 px-6 text-center text-sm text-white">
                {t("cameraUnavailable")}
              </div>
            ) : null}
          </div>
          <p className="px-6 py-4 text-center text-sm text-white/80">
            {t("scanCustomerQrHint")}
          </p>
        </div>
      ) : null}
    </>
  );
}
