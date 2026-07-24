"use client";

import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { adminAddPointBranch } from "@/lib/actions/point-application";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Ops tool (docs §42j): create an additional branch for an existing owner (or
// onboard one directly), found by email/phone. Collapsed by default so it
// doesn't crowd the network list. Delivery-manager gated server-side.
export function AddBranchForm() {
  const t = useTranslations("AdminPoints");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fields = [
    "owner",
    "name",
    "phone",
    "governorate",
    "city",
    "addressLine",
  ] as const;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      setMsg(null);
      const res = await adminAddPointBranch(fd);
      if (res.error) setMsg({ ok: false, text: t(`branchErr_${res.error}`) });
      else {
        setMsg({ ok: true, text: t("branchAdded") });
        formRef.current?.reset();
        router.refresh();
      }
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-primary flex min-h-10 items-center gap-1.5 text-sm font-medium"
      >
        <Plus className="size-4" /> {t("branchAddTitle")}
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="space-y-3 rounded-lg border p-4"
    >
      <p className="text-sm font-semibold">{t("branchAddTitle")}</p>
      <p className="text-muted-foreground text-xs">{t("branchAddHint")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map((f) => (
          <Input
            key={f}
            name={f}
            placeholder={t(`branch_${f}`)}
            dir={f === "owner" || f === "phone" ? "ltr" : undefined}
          />
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {t("branchAddBtn")}
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted-foreground flex min-h-10 items-center text-sm"
        >
          {t("branchCancel")}
        </button>
        {msg ? (
          <span
            className={
              msg.ok
                ? "text-xs text-emerald-600 dark:text-emerald-400"
                : "text-destructive text-xs"
            }
          >
            {msg.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}
