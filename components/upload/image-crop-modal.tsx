"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

type Size = { w: number; h: number };
type Rect = { x: number; y: number; w: number; h: number };
type Handle = "nw" | "ne" | "sw" | "se";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("load failed"));
    el.src = src;
  });
}

/**
 * Crop-before-upload dialog. Shows the WHOLE image and overlays a draggable,
 * corner-resizable crop box (aspect-locked) — so the user frames from any side
 * directly, no zoom slider. Apply maps the box back to the image's natural
 * pixels and draws that region to a canvas.
 *
 * The image is loaded as a data: URL (not blob:) because the app's CSP allows
 * `img-src data:` but not `blob:`. Rendered via portal on document.body so no
 * ancestor layout/transform affects it.
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
  const [area, setArea] = useState<Size>({ w: 0, h: 0 });
  const [box, setBox] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    mode: "move" | Handle;
    sx: number;
    sy: number;
    start: Rect;
  } | null>(null);

  useEffect(() => {
    const reader = new FileReader();
    reader.onload = () =>
      setSrc(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);

  useEffect(() => {
    const measure = () => {
      const el = areaRef.current;
      if (el) setArea({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [src]);

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

  // Where the whole image sits inside the area ("contain" fit, letterboxed).
  const imgRect: Rect | null =
    nat && area.w && area.h
      ? (() => {
          const scale = Math.min(area.w / nat.w, area.h / nat.h);
          const w = nat.w * scale;
          const h = nat.h * scale;
          return { x: (area.w - w) / 2, y: (area.h - h) / 2, w, h };
        })()
      : null;

  // Keep the crop box aspect-locked and inside the image.
  const clampBox = useCallback(
    (b: Rect): Rect => {
      if (!imgRect) return b;
      let w = Math.max(48, Math.min(b.w, imgRect.w));
      let h = w / aspect;
      if (h > imgRect.h) {
        h = imgRect.h;
        w = h * aspect;
      }
      const x = Math.min(Math.max(b.x, imgRect.x), imgRect.x + imgRect.w - w);
      const y = Math.min(Math.max(b.y, imgRect.y), imgRect.y + imgRect.h - h);
      return { x, y, w, h };
    },
    [imgRect, aspect],
  );

  // Seed the box (largest aspect-locked rect fitting the image) once we can.
  useEffect(() => {
    if (!imgRect || box) return;
    let w = imgRect.w;
    let h = w / aspect;
    if (h > imgRect.h) {
      h = imgRect.h;
      w = h * aspect;
    }
    setBox({
      x: imgRect.x + (imgRect.w - w) / 2,
      y: imgRect.y + (imgRect.h - h) / 2,
      w,
      h,
    });
  }, [imgRect, box, aspect]);

  const startDrag = (mode: "move" | Handle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!box) return;
    areaRef.current?.setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, start: { ...box } };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !box) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    const s = d.start;
    if (d.mode === "move") {
      setBox(clampBox({ ...s, x: s.x + dx, y: s.y + dy }));
      return;
    }
    // Corner resize, aspect-locked, anchored at the opposite corner.
    const right = s.x + s.w;
    const bottom = s.y + s.h;
    let w = d.mode === "se" || d.mode === "ne" ? s.w + dx : s.w - dx; // horizontal drag drives size
    w = Math.max(48, w);
    const h = w / aspect;
    let x = s.x;
    let y = s.y;
    if (d.mode === "sw" || d.mode === "nw") x = right - w;
    if (d.mode === "nw" || d.mode === "ne") y = bottom - h;
    setBox(clampBox({ x, y, w, h }));
  };

  const endDrag = () => {
    drag.current = null;
  };

  const apply = async () => {
    if (!nat || !imgRect || !box) return;
    setBusy(true);
    try {
      const scale = imgRect.w / nat.w; // display px per natural px
      const sx = Math.max(0, Math.round((box.x - imgRect.x) / scale));
      const sy = Math.max(0, Math.round((box.y - imgRect.y) / scale));
      const sw = Math.min(nat.w - sx, Math.round(box.w / scale));
      const sh = Math.min(nat.h - sy, Math.round(box.h / scale));
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

  const handlePos: Record<Handle, string> = {
    nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
    ne: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
    sw: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
    se: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
  };

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
          ref={areaRef}
          className="relative h-[52vh] max-h-96 w-full touch-none overflow-hidden rounded-lg bg-black/80 select-none"
          onPointerMove={onMove}
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
              style={
                imgRect
                  ? {
                      left: imgRect.x,
                      top: imgRect.y,
                      width: imgRect.w,
                      height: imgRect.h,
                    }
                  : { opacity: 0 }
              }
            />
          ) : null}

          {box && imgRect ? (
            <div
              className="absolute cursor-move touch-none outline outline-2 outline-white"
              style={{
                left: box.x,
                top: box.y,
                width: box.w,
                height: box.h,
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
              }}
              onPointerDown={startDrag("move")}
            >
              {(["nw", "ne", "sw", "se"] as Handle[]).map((c) => (
                <span
                  key={c}
                  onPointerDown={startDrag(c)}
                  className={`bg-primary absolute size-5 rounded-full border-2 border-white ${handlePos[c]}`}
                />
              ))}
            </div>
          ) : null}
        </div>

        <p className="text-muted-foreground mt-2 text-xs">{t("cropHint")}</p>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {t("cropCancel")}
          </Button>
          <Button onClick={apply} disabled={busy || !box}>
            {busy ? t("uploading") : t("cropApply")}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
