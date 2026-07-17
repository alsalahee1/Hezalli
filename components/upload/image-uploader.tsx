"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { compressImage } from "@/lib/image";
import { Button } from "@/components/ui/button";

// Uploads one image to /api/upload and reports the resulting public URL.
export function ImageUploader({
  folder,
  onUploaded,
  label,
  className,
}: {
  folder: "avatars" | "stores" | "products";
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
      const blob = await compressImage(file);
      const fd = new FormData();
      fd.append(
        "file",
        new File([blob], "upload.webp", { type: "image/webp" }),
      );
      fd.append("folder", folder);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { url: string };
      onUploaded(data.url);
    } catch {
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
