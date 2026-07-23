"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { compressImage } from "@/lib/image";
import { Button } from "@/components/ui/button";
import { ImageCropModal } from "@/components/upload/image-crop-modal";

type Folder = "avatars" | "stores" | "products" | "banners" | "proof" | "kyc";

// Default crop aspect per image kind — identity/branding images crop to a fixed
// shape (square avatars & logos, wide banners); documents and product photos
// upload as-is unless the caller opts into a crop via `aspect`. undefined = no
// crop step.
const CROP_ASPECT: Record<Folder, number | undefined> = {
  avatars: 1,
  stores: 1,
  banners: 16 / 9,
  products: undefined,
  proof: undefined,
  kyc: undefined,
};

// Longest-edge cap per kind, so stored files stay light. Avatars/logos never
// need more than a few hundred px; documents keep more detail for legibility.
const MAX_DIM: Record<Folder, number> = {
  avatars: 512,
  stores: 512,
  banners: 1600,
  products: 1600,
  proof: 2000,
  kyc: 2000,
};

// Maps an /api/upload error code to a translation key under the `Upload`
// namespace, so failures read as a specific reason instead of one blanket
// "upload failed".
function errorKeyFor(code: string | undefined): string {
  switch (code) {
    case "too_large":
      return "tooLarge";
    case "unsupported_type":
      return "unsupportedType";
    case "unauthorized":
      return "notSignedIn";
    case "storage_failed":
      return "serverError";
    default:
      return "failed";
  }
}

// Uploads one image to /api/upload and reports the resulting public URL.
export function ImageUploader({
  folder,
  onUploaded,
  label,
  className,
  aspect,
}: {
  folder: Folder;
  onUploaded: (url: string) => void;
  label?: string;
  className?: string;
  /** Override the crop aspect (width/height). Omit to use the per-folder
      default; pass 0 to skip cropping entirely. */
  aspect?: number;
}) {
  const t = useTranslations("Upload");
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toCrop, setToCrop] = useState<File | null>(null);

  const cropAspect = aspect ?? CROP_ASPECT[folder];
  const maxDim = MAX_DIM[folder];

  // Resize (to the per-folder cap) + WebP, then POST. Accepts the raw pick or a
  // cropped blob.
  async function uploadBlob(blob: Blob) {
    setBusy(true);
    try {
      let out: Blob;
      try {
        out = await compressImage(
          new File([blob], "src", { type: blob.type || "image/webp" }),
          maxDim,
        );
      } catch {
        // Couldn't decode (unsupported format like HEIC, or a corrupt file).
        setError(t("unsupportedType"));
        return;
      }

      const fd = new FormData();
      fd.append("file", new File([out], "upload.webp", { type: "image/webp" }));
      fd.append("folder", folder);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        // The route returns { error } JSON; some infra (e.g. body-size limits)
        // may return non-JSON — fall back to the generic message then.
        const code = await res
          .json()
          .then((d) => (d as { error?: string }).error)
          .catch(() => undefined);
        setError(t(errorKeyFor(code)));
        return;
      }
      const data = (await res.json()) as { url: string };
      onUploaded(data.url);
    } catch {
      // Network error / fetch rejected.
      setError(t("failed"));
    } finally {
      setBusy(false);
    }
  }

  // A picked file either opens the crop dialog (when this kind has an aspect)
  // or uploads straight through.
  function onPick(file: File) {
    setError(null);
    if (cropAspect) setToCrop(file);
    else void uploadBlob(file);
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />

      {toCrop && cropAspect ? (
        <ImageCropModal
          file={toCrop}
          aspect={cropAspect}
          onCancel={() => setToCrop(null)}
          onCropped={(blob) => {
            setToCrop(null);
            void uploadBlob(blob);
          }}
        />
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <ImagePlus className="size-4" />
        )}
        {busy ? t("uploading") : (label ?? t("upload"))}
      </Button>
      {error ? <p className="text-destructive mt-1 text-xs">{error}</p> : null}
    </div>
  );
}
