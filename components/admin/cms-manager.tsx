"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { deleteCmsPage, saveCmsPage } from "@/lib/actions/cms";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm-dialog";

export type CmsPageRow = {
  slug: string;
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  published: boolean;
};

const BLANK: CmsPageRow = {
  slug: "",
  titleEn: "",
  titleAr: "",
  bodyEn: "",
  bodyAr: "",
  published: false,
};

export function CmsManager({ pages }: { pages: CmsPageRow[] }) {
  const t = useTranslations("AdminPages");
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("desc")}</p>
        </div>
        <Button
          onClick={() => {
            setCreating((v) => !v);
            setEditing(null);
          }}
        >
          {t("newPage")}
        </Button>
      </div>

      {creating ? (
        <PageEditor initial={BLANK} isNew onDone={() => setCreating(false)} />
      ) : null}

      {pages.length === 0 && !creating ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-14 text-center text-sm">
          {t("empty")}
        </div>
      ) : (
        <ul className="space-y-2">
          {pages.map((p) => (
            <li key={p.slug} className="rounded-lg border">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    {p.titleEn || p.titleAr || p.slug}
                    {p.published ? (
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-medium text-emerald-600">
                        {t("published")}
                      </span>
                    ) : (
                      <span className="bg-muted rounded px-1.5 py-0.5 text-xs font-medium">
                        {t("draft")}
                      </span>
                    )}
                  </p>
                  <p className="text-muted-foreground font-mono text-xs">
                    /p/{p.slug}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setEditing((s) => (s === p.slug ? null : p.slug))
                  }
                >
                  {editing === p.slug ? t("close") : t("edit")}
                </Button>
              </div>
              {editing === p.slug ? (
                <div className="border-t p-4">
                  <PageEditor initial={p} onDone={() => setEditing(null)} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PageEditor({
  initial,
  isNew = false,
  onDone,
}: {
  initial: CmsPageRow;
  isNew?: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("AdminPages");
  const tc = useTranslations("Common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState<CmsPageRow>(initial);
  const { confirm, dialog } = useConfirm();
  const set = (k: keyof CmsPageRow, v: string | boolean) =>
    setF((s) => ({ ...s, [k]: v }));

  const save = () =>
    start(async () => {
      setErr(null);
      const res = await saveCmsPage(f);
      if (res.error) setErr(res.error);
      else {
        router.refresh();
        onDone();
      }
    });
  const remove = async () => {
    if (
      !(await confirm(tc("cannotUndo"), {
        title: t("deleteConfirm"),
        confirmLabel: t("delete"),
        destructive: true,
      }))
    )
      return;
    start(async () => {
      await deleteCmsPage(f.slug);
      router.refresh();
      onDone();
    });
  };

  return (
    <div className="space-y-3">
      {dialog}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-sm font-medium">{t("slug")}</span>
          <Input
            value={f.slug}
            onChange={(e) => set("slug", e.target.value)}
            disabled={!isNew}
            dir="ltr"
            placeholder="about"
          />
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={f.published}
            onChange={(e) => set("published", e.target.checked)}
          />
          {t("publishedLabel")}
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">{t("titleEn")}</span>
          <Input
            value={f.titleEn}
            onChange={(e) => set("titleEn", e.target.value)}
            dir="ltr"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">{t("titleAr")}</span>
          <Input
            value={f.titleAr}
            onChange={(e) => set("titleAr", e.target.value)}
            dir="rtl"
          />
        </label>
      </div>
      <label className="space-y-1.5">
        <span className="text-sm font-medium">{t("bodyEn")}</span>
        <Textarea
          value={f.bodyEn}
          onChange={(e) => set("bodyEn", e.target.value)}
          dir="ltr"
          rows={8}
          className="font-mono"
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-sm font-medium">{t("bodyAr")}</span>
        <Textarea
          value={f.bodyAr}
          onChange={(e) => set("bodyAr", e.target.value)}
          dir="rtl"
          rows={8}
          className="font-mono"
        />
      </label>
      <p className="text-muted-foreground text-xs">{t("htmlHint")}</p>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {t("save")}
        </Button>
        {!isNew ? (
          <Button
            variant="outline"
            className="text-destructive"
            onClick={remove}
            disabled={pending}
          >
            {t("delete")}
          </Button>
        ) : null}
        {err ? (
          <span className="text-destructive text-sm">{t(`err_${err}`)}</span>
        ) : null}
      </div>
    </div>
  );
}
