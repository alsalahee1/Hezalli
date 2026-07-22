"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { compressImage } from "@/lib/image";
import { Button } from "@/components/ui/button";

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
}: {
  folder: "avatars" | "stores" | "products" | "banners" | "proof" | "kyc";
  onUploaded: (url: string) => void;
  label?: string;
  className?: string;
}) {
  const t = useTranslations("Upload");
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      // Decode + re-encode in the browser. A failure here means the image
      // couldn't be read (unsupported format like HEIC, or a corrupt file).
      let blob: Blob;
      try {
        blob = await compressImage(file);
      } catch {
        setError(t("unsupportedType"));
        return;
      }

      const fd = new FormData();
      fd.append(
        "file",
        new File([blob], "upload.webp", { type: "image/webp" }),
      );
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
      if (inputRef.current) inputRef.current.value = "";
    }
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
          if (f) handleFile(f);
        }}
      />
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
