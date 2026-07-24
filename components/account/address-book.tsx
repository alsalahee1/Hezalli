"use client";

import { useRef, useState } from "react";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { deleteAddress, setDefaultAddress } from "@/lib/actions/account";
import { GOVERNORATES } from "@/lib/yemen";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";

import { AddressForm, type AddressData } from "./address-form";

export function AddressBook({ addresses }: { addresses: AddressData[] }) {
  const t = useTranslations("Account");
  const tc = useTranslations("Common");
  const locale = useLocale();
  // null = list view, "new" = adding, or an address id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  // Set right before a re-submit that follows a confirmed dialog, so the
  // handler lets that one submission through instead of intercepting it again.
  const confirmedRef = useRef(false);

  const govLabel = (value: string) => {
    const g = GOVERNORATES.find((x) => x.value === value);
    return g ? (locale === "ar" ? g.ar : g.en) : value;
  };

  return (
    <div className="space-y-4">
      {dialog}
      <Button onClick={() => setEditing("new")}>
        <Plus className="size-4" />
        {t("addAddress")}
      </Button>
      <Modal open={editing === "new"} onClose={() => setEditing(null)}>
        <AddressForm onDone={() => setEditing(null)} />
      </Modal>

      {addresses.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("noAddresses")}</p>
      ) : null}

      <ul className="space-y-3">
        {addresses.map((a) => (
          <li key={a.id} className="rounded-lg border p-4">
            <div className="space-y-3">
              <div>
                <p className="font-medium">
                  {a.fullName}
                  {a.isDefault ? (
                    <span className="bg-primary/10 text-primary ms-2 rounded px-1.5 py-0.5 text-xs font-normal">
                      {t("default")}
                    </span>
                  ) : null}
                </p>
                <p className="text-muted-foreground text-sm" dir="ltr">
                  {a.phone}
                </p>
                <p className="text-sm">
                  {a.line1}
                  {a.line2 ? `, ${a.line2}` : ""}, {a.city},{" "}
                  {govLabel(a.governorate)}
                </p>
                {a.notes ? (
                  <p className="text-muted-foreground text-sm">{a.notes}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3">
                {!a.isDefault ? (
                  <form action={setDefaultAddress}>
                    <input type="hidden" name="id" value={a.id} />
                    <Button type="submit" variant="outline">
                      <Star className="size-4" />
                      {t("setDefault")}
                    </Button>
                  </form>
                ) : null}
                <Button variant="outline" onClick={() => setEditing(a.id)}>
                  <Pencil className="size-4" />
                  {t("edit")}
                </Button>
                <form
                  action={deleteAddress}
                  onSubmit={(e) => {
                    if (confirmedRef.current) {
                      confirmedRef.current = false;
                      return;
                    }
                    e.preventDefault();
                    const form = e.currentTarget;
                    void confirm(tc("cannotUndo"), {
                      title: t("confirmDeleteAddress"),
                      confirmLabel: t("delete"),
                      destructive: true,
                    }).then((ok) => {
                      if (!ok) return;
                      confirmedRef.current = true;
                      form.requestSubmit();
                    });
                  }}
                >
                  <input type="hidden" name="id" value={a.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    className="text-destructive"
                  >
                    <Trash2 className="size-4" />
                    {t("delete")}
                  </Button>
                </form>
              </div>
            </div>
            <Modal open={editing === a.id} onClose={() => setEditing(null)}>
              <AddressForm address={a} onDone={() => setEditing(null)} />
            </Modal>
          </li>
        ))}
      </ul>
    </div>
  );
}
