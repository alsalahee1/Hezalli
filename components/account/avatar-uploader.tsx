"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { removeAvatar, updateAvatar } from "@/lib/actions/account";
import { ImageUploader } from "@/components/upload/image-uploader";
import { Button } from "@/components/ui/button";

export function AvatarUploader({
  initialUrl,
  initial,
}: {
  initialUrl: string | null;
  initial: string;
}) {
  const t = useTranslations("Account");
  const [url, setUrl] = useState(initialUrl);
  const [pending, start] = useTransition();

  const onUploaded = (u: string) => {
    setUrl(u);
    start(async () => {
      await updateAvatar(u);
    });
  };

  const onRemove = () => {
    setUrl(null);
    start(async () => {
      await removeAvatar();
    });
  };

  return (
    <div className="flex items-center gap-4">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="size-16 rounded-full object-cover"
          data-testid="avatar-img"
        />
      ) : (
        <span className="bg-primary text-primary-foreground flex size-16 items-center justify-center rounded-full text-xl font-semibold">
          {initial}
        </span>
      )}
      <div className="space-y-2">
        <ImageUploader
          folder="avatars"
          onUploaded={onUploaded}
          label={t("uploadPhoto")}
        />
        {url ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={onRemove}
            disabled={pending}
          >
            <Trash2 className="size-4" />
            {t("removePhoto")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
