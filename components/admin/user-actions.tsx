"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import {
  setUserRoles,
  setUserSuspended,
  softDeleteUser,
} from "@/lib/actions/admin-oversight";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

const ALL_ROLES = ["BUYER", "SELLER", "ADMIN"];

export function UserActions({
  userId,
  suspended,
  deleted,
  roles,
}: {
  userId: string;
  suspended: boolean;
  deleted: boolean;
  roles: string[];
}) {
  const t = useTranslations("AdminUsers");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editRoles, setEditRoles] = useState(false);
  const [sel, setSel] = useState<string[]>(roles);
  const { confirm, dialog } = useConfirm();

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  if (deleted) {
    return (
      <span className="text-muted-foreground text-xs">{t("deleted")}</span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {dialog}
      <div className="flex flex-wrap justify-end gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className={suspended ? "" : "text-destructive"}
          disabled={pending}
          onClick={() => run(() => setUserSuspended(userId, !suspended))}
        >
          {suspended ? t("unsuspend") : t("suspend")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => setEditRoles((v) => !v)}
        >
          {t("roles")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-destructive"
          disabled={pending}
          onClick={async () => {
            if (await confirm(t("deleteConfirm"), { destructive: true }))
              run(() => softDeleteUser(userId));
          }}
        >
          {t("delete")}
        </Button>
      </div>
      {editRoles ? (
        <div className="flex items-center gap-2">
          {ALL_ROLES.map((r) => (
            <label key={r} className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                className="size-3.5"
                checked={sel.includes(r)}
                onChange={(e) =>
                  setSel((s) =>
                    e.target.checked ? [...s, r] : s.filter((x) => x !== r),
                  )
                }
              />
              {r}
            </label>
          ))}
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const res = await setUserRoles(userId, sel);
                if (!res.error) setEditRoles(false);
                return res;
              })
            }
          >
            {t("save")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
