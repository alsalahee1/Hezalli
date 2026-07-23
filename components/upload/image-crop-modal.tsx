"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

type Size = { w: number; h: number };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("load failed"));
    el.src = src;
  });
}

/**
 * Crop-before-upload dialog. Self-contained (no third-party cropper): a plain
 * <img> is scaled to "cover" the fixed-aspect frame and can be panned/zoomed;
 * Apply maps the frame back to the image's natural pixels and draws that region
 * to a canvas. Rendered as a portal overlay on document.body so no ancestor's
 * layout/transform affects it. Downscale/WebP re-encode is left to compressImage.
 */
export function ImageCropModal({
  file,
  aspect,
  onCancel,
  onCropped,
}: {
  file: File;
  aspect: number;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}) {
  const t = useTranslations("Upload");
  const [src, setSrc] = useState("");
  const [nat, setNat] = useState<Size | null>(null);
  const [vpW, setVpW] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const vpRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
    null,
  );

  // Load as a data: URL, NOT a blob: object URL — the app's CSP allows
  // `img-src 'self' data: https:` but not `blob:`, so an <img src="blob:…">
  // is blocked by the browser and never renders (the bug behind the blank
  // crop frame). createImageBitmap in compressImage reads the File directly,
  // which is why upload worked while this preview didn't.
  useEffect(() => {
    const reader = new FileReader();
    reader.onload = () =>
      setSrc(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);

  // Track the frame's rendered width (its height follows from `aspect`).
  useEffect(() => {
    const measure = () => setVpW(vpRef.current?.clientWidth ?? 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [src]);

  // Scroll-lock + Escape while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vpH = vpW / aspect;
  // At zoom 1 the image just covers the frame; zoom multiplies from there.
  const baseScale = nat && vpW ? Math.max(vpW / nat.w, vpH / nat.h) : 1;
  const dispW = nat ? nat.w * baseScale * zoom : 0;
  const dispH = nat ? nat.h * baseScale * zoom : 0;

  // Keep the image covering the frame — no gaps at the edges.
  const clamp = useCallback(
    (p: { x: number; y: number }) => {
      const mx = Math.max(0, (dispW - vpW) / 2);
      const my = Math.max(0, (dispH - vpH) / 2);
      return {
        x: Math.min(mx, Math.max(-mx, p.x)),
        y: Math.min(my, Math.max(-my, p.y)),
      };
    },
    [dispW, dispH, vpW, vpH],
  );

  useEffect(() => {
    setPos((p) => clamp(p));
  }, [zoom, clamp]);

  const imgLeft = vpW / 2 - dispW / 2 + pos.x;
  const imgTop = vpH / 2 - dispH / 2 + pos.y;

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPos(
      clamp({
        x: drag.current.px + (e.clientX - drag.current.x),
        y: drag.current.py + (e.clientY - drag.current.y),
      }),
    );
  };
  const endDrag = () => {
    drag.current = null;
  };

  const apply = async () => {
    if (!nat || !vpW) return;
    setBusy(true);
    try {
      const scale = baseScale * zoom; // displayed px per natural px
      const sx = Math.max(0, Math.round(-imgLeft / scale));
      const sy = Math.max(0, Math.round(-imgTop / scale));
      const sw = Math.min(nat.w - sx, Math.round(vpW / scale));
      const sh = Math.min(nat.h - sy, Math.round(vpH / scale));
      const img = await loadImage(src);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, sw);
      canvas.height = Math.max(1, sh);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas unsupported");
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("encode failed"))),
          "image/webp",
          0.92,
        ),
      );
      onCropped(blob);
    } finally {
      setBusy(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
        aria-hidden
      />
      <div className="bg-background relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border p-5 pb-[env(safe-area-inset-bottom)] sm:max-w-md sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">{t("cropTitle")}</h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t("cropCancel")}
            className="hover:bg-muted text-muted-foreground inline-flex size-8 items-center justify-center rounded-md transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        <div
          ref={vpRef}
          className="bg-muted relative w-full touch-none overflow-hidden rounded-lg select-none"
          style={{ aspectRatio: String(aspect) }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              draggable={false}
              onLoad={(e) =>
                setNat({
                  w: e.currentTarget.naturalWidth,
                  h: e.currentTarget.naturalHeight,
                })
              }
              className="pointer-events-none absolute max-w-none select-none"
              style={{
                left: imgLeft,
                top: imgTop,
                width: dispW || undefined,
                height: dispH || undefined,
              }}
            />
          ) : null}
        </div>

        <label className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
          {t("zoom")}
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
            dir="ltr"
          />
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {t("cropCancel")}
          </Button>
          <Button onClick={apply} disabled={busy || !nat}>
            {busy ? t("uploading") : t("cropApply")}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
