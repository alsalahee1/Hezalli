"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  deleteBanner,
  saveBanner,
  toggleBanner,
  type SaveBannerInput,
} from "@/lib/actions/banner";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { ImageUploader } from "@/components/upload/image-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type BannerRow = {
  id: string;
  image: string;
  titleEn: string;
  titleAr: string;
  linkUrl: string;
  position: string;
  isActive: boolean;
  sortOrder: number;
  startsAt: string; // yyyy-mm-dd or ""
  endsAt: string;
};

const EMPTY: BannerRow = {
  id: "",
  image: "",
  titleEn: "",
  titleAr: "",
  linkUrl: "",
  position: "home_hero",
  isActive: true,
  sortOrder: 0,
  startsAt: "",
  endsAt: "",
};

export function BannerManager({ banners }: { banners: BannerRow[] }) {
  const t = useTranslations("AdminBanners");
  const router = useRouter();
  const [editing, setEditing] = useState<BannerRow | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setErr(null);
      const res = await fn();
      if (res.error) setErr(res.error);
      else {
        setEditing(null);
        router.refresh();
      }
    });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("desc")}</p>
        </div>
        {!editing ? (
          <Button size="sm" onClick={() => setEditing({ ...EMPTY })}>
            <Plus className="size-4" />
            {t("add")}
          </Button>
        ) : null}
      </div>

      {editing ? (
        <BannerForm
          value={editing}
          pending={pending}
          error={err}
          onChange={setEditing}
          onCancel={() => {
            setEditing(null);
            setErr(null);
          }}
          onSave={() =>
            run(() => {
              const payload: SaveBannerInput = {
                id: editing.id || undefined,
                image: editing.image,
                titleEn: editing.titleEn,
                titleAr: editing.titleAr,
                linkUrl: editing.linkUrl,
                position: editing.position,
                isActive: editing.isActive,
                sortOrder: editing.sortOrder,
                startsAt: editing.startsAt,
                endsAt: editing.endsAt,
              };
              return saveBanner(payload);
            })
          }
        />
      ) : null}

      {banners.length === 0 && !editing ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-14 text-center text-sm">
          {t("empty")}
        </div>
      ) : (
        <ul className="space-y-3">
          {banners.map((b) => (
            <li
              key={b.id}
              className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
            >
              <div className="bg-muted aspect-[16/6] w-full overflow-hidden rounded sm:w-48">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={b.image}
                  alt={b.titleEn || b.titleAr}
                  className="size-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {b.titleEn || b.titleAr || t("untitled")}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {b.linkUrl || "—"}
                </p>
                <span
                  className={cn(
                    "mt-1 inline-block rounded px-1.5 py-0.5 text-xs font-medium",
                    b.isActive
                      ? "bg-emerald-500/15 text-emerald-600"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {b.isActive ? t("active") : t("inactive")}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => toggleBanner(b.id, !b.isActive))}
                >
                  {b.isActive ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(b)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(t("confirmDelete")))
                      run(() => deleteBanner(b.id));
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BannerForm({
  value,
  pending,
  error,
  onChange,
  onSave,
  onCancel,
}: {
  value: BannerRow;
  pending: boolean;
  error: string | null;
  onChange: (v: BannerRow) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("AdminBanners");
  const set = (patch: Partial<BannerRow>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <label className="mb-1 block text-sm font-medium">{t("image")}</label>
        <div className="flex items-center gap-3">
          <div className="bg-muted aspect-[16/6] w-48 overflow-hidden rounded border">
            {value.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={value.image}
                alt=""
                className="size-full object-cover"
              />
            ) : null}
          </div>
          <ImageUploader
            folder="banners"
            onUploaded={(url) => set({ image: url })}
          />
        </div>
        <p className="text-muted-foreground mt-1 text-xs">{t("imageHint")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("titleEn")}</span>
          <Input
            value={value.titleEn}
            onChange={(e) => set({ titleEn: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("titleAr")}</span>
          <Input
            value={value.titleAr}
            dir="rtl"
            onChange={(e) => set({ titleAr: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("linkUrl")}</span>
          <Input
            value={value.linkUrl}
            placeholder="/c/electronics"
            dir="ltr"
            onChange={(e) => set({ linkUrl: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("position")}</span>
          <select
            value={value.position}
            onChange={(e) => set({ position: e.target.value })}
            className="bg-background h-10 w-full rounded-md border px-3 text-sm"
          >
            <option value="home_hero">{t("posHomeHero")}</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("order")}</span>
          <Input
            type="number"
            value={String(value.sortOrder)}
            dir="ltr"
            onChange={(e) => set({ sortOrder: Number(e.target.value) })}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("startsAt")}</span>
          <Input
            type="date"
            value={value.startsAt}
            dir="ltr"
            onChange={(e) => set({ startsAt: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("endsAt")}</span>
          <Input
            type="date"
            value={value.endsAt}
            dir="ltr"
            onChange={(e) => set({ endsAt: e.target.value })}
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.isActive}
          onChange={(e) => set({ isActive: e.target.checked })}
          className="size-4"
        />
        {t("active")}
      </label>

      {error ? <p className="text-destructive text-sm">{t(error)}</p> : null}

      <div className="flex gap-2">
        <Button onClick={onSave} disabled={pending || !value.image}>
          {t("save")}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
