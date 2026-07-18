"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { deleteCarrier, saveCarrier } from "@/lib/actions/carrier";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type CarrierRow = {
  id: string;
  name: string;
  trackingUrl: string | null;
  platformManaged: boolean;
};

type Editing = {
  id?: string;
  name: string;
  trackingUrl: string;
  platformManaged: boolean;
} | null;

export function CarrierManager({ carriers }: { carriers: CarrierRow[] }) {
  const t = useTranslations("AdminCarriers");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Editing>(null);
  const [err, setErr] = useState<string | null>(null);

  const openNew = () => {
    setErr(null);
    setEditing({ name: "", trackingUrl: "", platformManaged: false });
  };
  const openEdit = (c: CarrierRow) => {
    setErr(null);
    setEditing({
      id: c.id,
      name: c.name,
      trackingUrl: c.trackingUrl ?? "",
      platformManaged: c.platformManaged,
    });
  };

  const save = () =>
    start(async () => {
      if (!editing) return;
      setErr(null);
      const res = await saveCarrier(editing);
      if (res.error) {
        setErr(res.error);
        return;
      }
      setEditing(null);
      router.refresh();
    });

  const remove = (id: string) =>
    start(async () => {
      await deleteCarrier(id);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openNew} disabled={pending}>
          <Plus className="size-4" /> {t("addCarrier")}
        </Button>
      </div>

      {editing ? (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("name")}</label>
            <Input
              value={editing.name}
              onChange={(e) =>
                setEditing((s) => (s ? { ...s, name: e.target.value } : s))
              }
              placeholder={t("namePlaceholder")}
              className="max-w-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("trackingUrl")}</label>
            <Input
              value={editing.trackingUrl}
              onChange={(e) =>
                setEditing((s) =>
                  s ? { ...s, trackingUrl: e.target.value } : s,
                )
              }
              placeholder="https://carrier.com/track/{tracking}"
              className="max-w-lg"
              dir="ltr"
            />
            <p className="text-muted-foreground text-xs">{t("trackingHint")}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={editing.platformManaged}
              onChange={(e) =>
                setEditing((s) =>
                  s ? { ...s, platformManaged: e.target.checked } : s,
                )
              }
            />
            {t("platformManaged")}
          </label>
          {err ? (
            <p className="text-destructive text-sm">{t(`err_${err}`)}</p>
          ) : null}
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={pending}>
              {t("save")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(null)}
              disabled={pending}
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : null}

      {carriers.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-14 text-center text-sm">
          {t("empty")}
        </div>
      ) : (
        <ul className="space-y-2">
          {carriers.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {c.name}
                  {c.platformManaged ? (
                    <span className="bg-primary/10 text-primary ms-2 rounded px-1.5 py-0.5 text-xs font-medium">
                      {t("platform")}
                    </span>
                  ) : null}
                </p>
                <p className="text-muted-foreground truncate text-sm" dir="ltr">
                  {c.trackingUrl ?? t("noTracking")}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openEdit(c)}
                  disabled={pending}
                >
                  <Pencil className="size-4" /> {t("edit")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={() => remove(c.id)}
                  disabled={pending}
                >
                  <Trash2 className="size-4" /> {t("delete")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
