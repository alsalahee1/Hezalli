"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useMountTransition } from "@/components/ui/use-mount-transition";
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

/**
 * Generic full-screen QR scan sheet. The camera runs only while `open`; each
 * detected code is handed to `onScan`, which owns all business logic and
 * returns an error message to show (and keep scanning) or `null` on success —
 * in which case the parent is expected to close the sheet. A manual paste box
 * is always offered as a fallback for phones without the Barcode Detection API.
 *
 * This is the one camera loop the app shares; feature sheets (add staff, pay,
 * hand over a parcel…) supply their own `onScan` instead of re-implementing it.
 */
export function QrScanSheet({
  open,
  onClose,
  title,
  scanHint,
  startingLabel,
  cameraUnavailableLabel,
  manualLabel,
  manualPlaceholder,
  manualSubmitLabel,
  closeLabel,
  busyLabel,
  onScan,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  scanHint: string;
  startingLabel: string;
  cameraUnavailableLabel: string;
  manualLabel: string;
  manualPlaceholder: string;
  manualSubmitLabel: string;
  closeLabel: string;
  busyLabel: string;
  /** Handle a scanned/typed value. Return an error message to display and keep
   *  scanning, or `null` when it succeeded (the caller should close the sheet). */
  onScan: (raw: string) => Promise<string | null>;
}) {
  const { mounted, shown } = useMountTransition(open);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Latched while an onScan call is in flight so the camera loop doesn't fire a
  // second lookup on the next frame before the first resolves.
  const handlingRef = useRef(false);

  const handle = async (raw: string) => {
    if (handlingRef.current) return;
    handlingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const err = await onScan(raw);
      if (err) {
        setError(err);
        // Debounce so the same code in frame doesn't instantly re-fire.
        setTimeout(() => {
          handlingRef.current = false;
        }, 1200);
      }
      // On success the parent closes us; leave the latch set so nothing else
      // fires during the close animation.
    } finally {
      setBusy(false);
    }
  };

  // Camera lifecycle — tied to `open`. Kept intentionally close to the wallet
  // pay sheet so behaviour (env-facing camera, scanline, cleanup) matches.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setManual("");
    handlingRef.current = false;
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
          if (!handlingRef.current) {
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes.length > 0 && codes[0].rawValue) {
                await handle(codes[0].rawValue);
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
      setScanning(false);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "bg-background fixed inset-0 z-50 flex transform-gpu flex-col transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform motion-reduce:transition-none",
        shown ? "translate-y-0" : "translate-y-full",
      )}
    >
      <header className="flex items-center justify-between border-b px-4 py-3">
        <span className="font-semibold">{title}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="hover:bg-muted flex size-11 items-center justify-center rounded-md"
        >
          <X className="size-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-sm space-y-4">
          {supported !== false ? (
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl border bg-black">
              <video
                ref={videoRef}
                className="size-full object-cover"
                muted
                playsInline
              />
              <div className="pointer-events-none absolute inset-10 overflow-hidden rounded-xl border-2 border-white/80">
                {scanning ? <span className="qr-scanline" /> : null}
              </div>
              {!scanning || busy ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm text-white">
                  <Camera className="me-2 size-5" />{" "}
                  {busy ? busyLabel : startingLabel}
                </div>
              ) : null}
            </div>
          ) : null}

          <p className="text-muted-foreground flex items-center justify-center gap-2 text-center text-sm">
            <Camera className="size-4" />
            {supported === false ? cameraUnavailableLabel : scanHint}
          </p>

          {/* Manual fallback — always available. */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (manual.trim() && !busy) handle(manual);
            }}
            className="space-y-2"
          >
            <label className="text-muted-foreground text-sm font-medium">
              {manualLabel}
            </label>
            <div className="flex gap-2">
              <Input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder={manualPlaceholder}
                dir="ltr"
                className="h-11"
              />
              <Button
                type="submit"
                className="h-11"
                disabled={!manual.trim() || busy}
              >
                {manualSubmitLabel}
              </Button>
            </div>
          </form>

          {error ? (
            <p className="text-destructive text-center text-sm">{error}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
