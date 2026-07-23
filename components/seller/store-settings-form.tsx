"use client";

import { useActionState, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { updateStoreSettings, type FormState } from "@/lib/actions/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploader } from "@/components/upload/image-uploader";

export type StoreSettingsData = {
  name: string;
  slug: string;
  description: string;
  returnPolicy: string;
  shippingPolicy: string;
  contact: string;
  logo: string;
  banner: string;
};

export function StoreSettingsForm({ store }: { store: StoreSettingsData }) {
  const t = useTranslations("SellerSettings");
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateStoreSettings,
    {},
  );
  const err = (k?: string) => (k ? t(k) : undefined);

  const field = (key: string) => state.errors?.[key];

  const [logo, setLogo] = useState(store.logo);
  const [banner, setBanner] = useState(store.banner);

  return (
    <form action={action} className="max-w-2xl space-y-5" noValidate>
      {state.ok ? (
        <p
          role="status"
          className="bg-primary/10 text-primary rounded-md px-3 py-2 text-sm"
        >
          {t("saved")}
        </p>
      ) : null}
      {state.formError ? (
        <p
          role="alert"
          className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
        >
          {t(state.formError)}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="name">{t("storeName")}</Label>
        <Input
          id="name"
          name="name"
          defaultValue={store.name}
          required
          aria-invalid={Boolean(field("name"))}
        />
        {field("name") ? (
          <p className="text-destructive text-xs">{err(field("name"))}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="slug">{t("slug")}</Label>
        <div className="flex items-center gap-2" dir="ltr">
          <span className="text-muted-foreground text-sm">/store/</span>
          <Input
            id="slug"
            name="slug"
            defaultValue={store.slug}
            required
            className="font-mono"
            aria-invalid={Boolean(field("slug"))}
          />
        </div>
        <p className="text-muted-foreground text-xs">{t("slugHelp")}</p>
        {field("slug") ? (
          <p className="text-destructive text-xs">{err(field("slug"))}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">{t("description")}</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={store.description}
          aria-invalid={Boolean(field("description"))}
        />
        {field("description") ? (
          <p className="text-destructive text-xs">
            {err(field("description"))}
          </p>
        ) : null}
      </div>

      {/* Branding: logo + banner, uploaded via /api/upload; the hidden
          inputs carry the resulting URLs into the server action. */}
      <input type="hidden" name="logo" value={logo} />
      <input type="hidden" name="banner" value={banner} />
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t("logo")}</Label>
          <div className="flex items-center gap-3">
            {logo ? (
              <span className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logo}
                  alt=""
                  className="size-16 rounded-full border object-cover"
                />
                <button
                  type="button"
                  onClick={() => setLogo("")}
                  aria-label={t("removeImage")}
                  className="bg-background text-muted-foreground hover:text-destructive absolute -end-1 -top-1 rounded-full border p-0.5"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ) : null}
            <ImageUploader
              folder="stores"
              onUploaded={setLogo}
              label={t("uploadLogo")}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t("banner")}</Label>
          <div className="space-y-2">
            {banner ? (
              <span className="relative block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={banner}
                  alt=""
                  className="h-20 w-full rounded-md border object-cover"
                />
                <button
                  type="button"
                  onClick={() => setBanner("")}
                  aria-label={t("removeImage")}
                  className="bg-background text-muted-foreground hover:text-destructive absolute -end-1 -top-1 rounded-full border p-0.5"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ) : null}
            <ImageUploader
              folder="banners"
              onUploaded={setBanner}
              label={t("uploadBanner")}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="returnPolicy">{t("returnPolicy")}</Label>
          <Textarea
            id="returnPolicy"
            name="returnPolicy"
            rows={4}
            defaultValue={store.returnPolicy}
            aria-invalid={Boolean(field("returnPolicy"))}
          />
          {field("returnPolicy") ? (
            <p className="text-destructive text-xs">
              {err(field("returnPolicy"))}
            </p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="shippingPolicy">{t("shippingPolicy")}</Label>
          <Textarea
            id="shippingPolicy"
            name="shippingPolicy"
            rows={4}
            defaultValue={store.shippingPolicy}
            aria-invalid={Boolean(field("shippingPolicy"))}
          />
          {field("shippingPolicy") ? (
            <p className="text-destructive text-xs">
              {err(field("shippingPolicy"))}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="contact">{t("contact")}</Label>
        <Input
          id="contact"
          name="contact"
          defaultValue={store.contact}
          placeholder={t("contactHint")}
          aria-invalid={Boolean(field("contact"))}
        />
        {field("contact") ? (
          <p className="text-destructive text-xs">{err(field("contact"))}</p>
        ) : null}
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
