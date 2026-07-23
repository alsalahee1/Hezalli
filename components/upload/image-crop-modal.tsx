"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

// Draw the selected crop rectangle (in the image's natural pixels, as
// react-easy-crop reports it) onto a canvas and export it. Downscale/WebP
// re-encoding is left to compressImage afterwards, so this keeps full crop
// resolution.
async function cropToBlob(src: string, area: Area): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("load failed"));
    el.src = src;
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(area.width));
  canvas.height = Math.max(1, Math.round(area.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unsupported");
  ctx.drawImage(
    img,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("encode failed"))),
      "image/webp",
      0.92,
    ),
  );
}

// Crop-before-upload dialog: pan + zoom the picked image within a fixed-aspect
// frame, then hand the cropped bytes back to the uploader (which resizes and
// uploads). Rendered as a plain portal overlay — NOT the shared Modal — because
// react-easy-crop measures its container with getBoundingClientRect, and the
// Modal's transform/scale animation makes that measurement wrong (the image
// scales to nothing and shows black). A static, untransformed container fixes it.
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
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Lock background scroll + close on Escape while open.
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

  const onComplete = useCallback((_area: Area, px: Area) => {
    setAreaPixels(px);
  }, []);

  const apply = async () => {
    if (!areaPixels) return;
    setBusy(true);
    try {
      onCropped(await cropToBlob(src, areaPixels));
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

        <div className="relative h-72 w-full overflow-hidden rounded-lg bg-black">
          {src ? (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onComplete}
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
          <Button onClick={apply} disabled={busy || !areaPixels}>
            {busy ? t("uploading") : t("cropApply")}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
