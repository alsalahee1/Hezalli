"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheck, Clock, Upload, XCircle } from "lucide-react";

import { submitKyc } from "@/lib/actions/kyc";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ImageUploader } from "@/components/upload/image-uploader";

type KycState = "NONE" | "PENDING" | "VERIFIED" | "REJECTED";

// eKYC submission: capture ID front (+ optional back) and a selfie, then send
// for review. Shown on the seller settings payout section. Rendering adapts to
// the current status: submit form for NONE/REJECTED, a waiting notice for
// PENDING, a verified badge otherwise.
export function KycSubmit({ status }: { status: KycState }) {
  const t = useTranslations("Kyc");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [idFront, setIdFront] = useState("");
  const [idBack, setIdBack] = useState("");
  const [selfie, setSelfie] = useState("");
  const [err, setErr] = useState<string | null>(null);

  if (status === "VERIFIED") {
    return (
      <p className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-3 py-2 text-sm text-emerald-600">
        <BadgeCheck className="size-4" /> {t("verified")}
      </p>
    );
  }
  if (status === "PENDING") {
    return (
      <p className="text-muted-foreground bg-muted inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm">
        <Clock className="size-4" /> {t("pending")}
      </p>
    );
  }

  const submit = () =>
    start(async () => {
      setErr(null);
      const res = await submitKyc({ idFront, idBack, selfie });
      if (res.error) setErr(t(`error_${res.error}`));
      else router.refresh();
    });

  const shot = (
    label: string,
    hint: string,
    value: string,
    setValue: (u: string) => void,
  ) => (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt={label}
          className="h-28 w-full rounded-md border object-cover"
        />
      ) : null}
      <ImageUploader
        folder="kyc"
        onUploaded={setValue}
        label={value ? t("replace") : hint}
      />
    </div>
  );

  return (
    <div className="space-y-4 rounded-lg border p-4">
      {status === "REJECTED" ? (
        <p className="text-destructive inline-flex items-center gap-1.5 text-sm">
          <XCircle className="size-4" /> {t("rejected")}
        </p>
      ) : null}
      <p className="text-muted-foreground text-sm">{t("intro")}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        {shot(t("idFront"), t("idFrontHint"), idFront, setIdFront)}
        {shot(t("idBack"), t("idBackHint"), idBack, setIdBack)}
        {shot(t("selfie"), t("selfieHint"), selfie, setSelfie)}
      </div>
      <div className="flex items-center gap-3">
        <Button
          disabled={pending || !idFront || !selfie}
          onClick={submit}
          className="gap-2"
        >
          <Upload className="size-4" /> {t("submit")}
        </Button>
        {err ? <p className="text-destructive text-xs">{err}</p> : null}
      </div>
      <p className="text-muted-foreground text-xs">{t("privacy")}</p>
    </div>
  );
}
