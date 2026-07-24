"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { deleteZone, saveZone } from "@/lib/actions/shipping-zone";
import { useRouter } from "@/i18n/navigation";
import { GOVERNORATES } from "@/lib/yemen";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";

export type ZoneRow = { id: string; name: string; governorates: string[] };

type Editing = { id?: string; name: string; govs: Set<string> } | null;

export function ShippingZoneManager({ zones }: { zones: ZoneRow[] }) {
  const t = useTranslations("AdminShippingZones");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Editing>(null);
  const [err, setErr] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string[]>([]);
  const { confirm, dialog } = useConfirm();

  const label = (value: string) =>
    GOVERNORATES.find((g) => g.value === value)?.[
      locale === "ar" ? "ar" : "en"
    ] ?? value;

  const openNew = () => {
    setErr(null);
    setConflict([]);
    setEditing({ name: "", govs: new Set() });
  };
  const openEdit = (z: ZoneRow) => {
    setErr(null);
    setConflict([]);
    setEditing({ id: z.id, name: z.name, govs: new Set(z.governorates) });
  };

  const toggle = (value: string) =>
    setEditing((e) => {
      if (!e) return e;
      const govs = new Set(e.govs);
      if (govs.has(value)) govs.delete(value);
      else govs.add(value);
      return { ...e, govs };
    });

  const save = () =>
    start(async () => {
      if (!editing) return;
      setErr(null);
      setConflict([]);
      const res = await saveZone({
        id: editing.id,
        name: editing.name,
        governorates: [...editing.govs],
      });
      if (res.error) {
        setErr(res.error);
        setConflict(res.conflict ?? []);
        return;
      }
      setEditing(null);
      router.refresh();
    });

  const remove = async (id: string, name: string) => {
    if (
      !(await confirm(t("deleteConfirm", { name }), {
        title: t("deleteTitle"),
        destructive: true,
        confirmLabel: t("delete"),
      }))
    )
      return;
    start(async () => {
      await deleteZone(id);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {dialog}
      <div className="flex justify-end">
        <Button size="sm" onClick={openNew} disabled={pending}>
          <Plus className="size-4" /> {t("addZone")}
        </Button>
      </div>

      {editing ? (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("zoneName")}</label>
            <Input
              value={editing.name}
              onChange={(e) =>
                setEditing((s) => (s ? { ...s, name: e.target.value } : s))
              }
              placeholder={t("zoneNamePlaceholder")}
              className="max-w-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("governorates")}</label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {GOVERNORATES.map((g) => (
                <label
                  key={g.value}
                  className={cn(
                    "flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm",
                    editing.govs.has(g.value)
                      ? "border-primary bg-primary/5"
                      : "hover:border-muted-foreground/40",
                    conflict.includes(g.value) &&
                      "border-destructive bg-destructive/5",
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={editing.govs.has(g.value)}
                    onChange={() => toggle(g.value)}
                  />
                  {locale === "ar" ? g.ar : g.en}
                </label>
              ))}
            </div>
          </div>
          {err ? (
            <p className="text-destructive text-sm">
              {t(`err_${err}`)}
              {conflict.length > 0 ? `: ${conflict.map(label).join("، ")}` : ""}
            </p>
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

      {zones.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-14 text-center text-sm">
          {t("empty")}
        </div>
      ) : (
        <ul className="space-y-2">
          {zones.map((z) => (
            <li
              key={z.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
            >
              <div className="min-w-0">
                <p className="font-medium">{z.name}</p>
                <p className="text-muted-foreground text-sm">
                  {z.governorates.map(label).join("، ")}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openEdit(z)}
                  disabled={pending}
                >
                  <Pencil className="size-4" /> {t("edit")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={() => remove(z.id, z.name)}
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
