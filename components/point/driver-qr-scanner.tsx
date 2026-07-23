"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Modal } from "@/components/ui/modal";

// Minimal typing for the browser Barcode Detection API (not yet in lib.dom) —
// same shape point-scan.tsx uses.
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts?: {
  formats?: string[];
}) => BarcodeDetectorLike;

// A driver's collection QR encodes "hezalli:driver:<userId>" (the driver app's
// My-QR card). We only care about that shape here.
const DRIVER_QR = /^hezalli:driver:([\w-]+)$/i;

/**
 * A one-shot camera modal that reads a driver's collection QR and hands the
 * courier id back via onDetect, then the caller closes it. Used by the counter
 * cash-in flow so the operator scans the driver instead of hunting a dropdown.
 * Degrades to a "camera unavailable" note where the Barcode Detection API isn't
 * present — the caller's driver picker still works.
 */
export function DriverQrScanner({
  open,
  onClose,
  onDetect,
}: {
  open: boolean;
  onClose: () => void;
  onDetect: (driverId: string) => void;
}) {
  const t = useTranslations("Point");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  // Keep the latest onDetect without making it an effect dependency (the caller
  // passes an inline arrow), so the camera isn't torn down on every render.
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;

  useEffect(() => {
    if (!open) return;
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

        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const raw = codes[0]?.rawValue?.trim();
            const m = raw?.match(DRIVER_QR);
            if (m) {
              onDetectRef.current(m[1]);
              return; // one-shot — stop scheduling once we have a driver
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
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} closeLabel={t("close")}>
      <div className="space-y-3">
        <h3 className="font-semibold">{t("scanDriverTitle")}</h3>
        {supported === false ? (
          <p className="text-muted-foreground text-sm">
            {t("cameraUnavailable")}
          </p>
        ) : (
          <>
            <div className="aspect-square w-full overflow-hidden rounded-lg border bg-black">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                muted
                playsInline
              />
            </div>
            <p className="text-muted-foreground text-xs">
              {t("scanDriverHint")}
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
