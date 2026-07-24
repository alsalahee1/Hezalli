"use client";

import { useState, useTransition } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  removeDeliveryTeamMember,
  saveDeliveryTeamMember,
  updateDeliveryTeamScopes,
} from "@/lib/actions/delivery-team";
import { DELIVERY_SCOPES, type DeliveryScope } from "@/lib/delivery-access";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type TeamMember = {
  id: string;
  name: string | null;
  email: string | null;
  scopes: DeliveryScope[];
};

// Reusable desk-checkbox grid. `selected` is the set of checked desks; toggling
// calls back with the next set.
function DeskPicker({
  selected,
  onToggle,
  idPrefix,
}: {
  selected: Set<DeliveryScope>;
  onToggle: (scope: DeliveryScope) => void;
  idPrefix: string;
}) {
  const t = useTranslations("AdminDeliveryTeam");
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {DELIVERY_SCOPES.map((scope) => (
        <label
          key={scope}
          htmlFor={`${idPrefix}-${scope}`}
          className="flex items-start gap-2 rounded-md border p-2 text-sm"
        >
          <input
            id={`${idPrefix}-${scope}`}
            type="checkbox"
            className="mt-0.5 size-4"
            checked={selected.has(scope)}
            onChange={() => onToggle(scope)}
          />
          <span>
            <span className="font-medium">{t(`scope_${scope}`)}</span>
            <span className="text-muted-foreground block text-xs">
              {t(`scopeDesc_${scope}`)}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}

function scopesToForm(fd: FormData, scopes: Set<DeliveryScope>) {
  for (const s of scopes) fd.append("scopes", s);
}

function MemberRow({ member }: { member: TeamMember }) {
  const t = useTranslations("AdminDeliveryTeam");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<DeliveryScope>>(
    new Set(member.scopes),
  );

  const toggle = (scope: DeliveryScope) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });

  const save = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("userId", member.id);
      scopesToForm(fd, selected);
      await updateDeliveryTeamScopes(fd);
      router.refresh();
    });

  const remove = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("userId", member.id);
      await removeDeliveryTeamMember(fd);
      router.refresh();
    });

  const isHead = selected.size === 0;

  return (
    <li className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            {member.name ?? member.email ?? member.id.slice(-6)}
            {isHead ? (
              <span className="bg-primary/10 text-primary ms-2 rounded px-1.5 py-0.5 text-xs font-medium">
                {t("headOfDelivery")}
              </span>
            ) : null}
          </p>
          {member.email ? (
            <p className="text-muted-foreground truncate text-sm" dir="ltr">
              {member.email}
            </p>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="text-destructive"
          onClick={remove}
          disabled={pending}
        >
          <Trash2 className="size-4" /> {t("remove")}
        </Button>
      </div>

      <DeskPicker selected={selected} onToggle={toggle} idPrefix={member.id} />
      <p className="text-muted-foreground text-xs">{t("headNote")}</p>

      <Button size="sm" onClick={save} disabled={pending}>
        {t("save")}
      </Button>
    </li>
  );
}

export function DeliveryTeamManager({ members }: { members: TeamMember[] }) {
  const t = useTranslations("AdminDeliveryTeam");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<Set<DeliveryScope>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  const toggle = (scope: DeliveryScope) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });

  const add = () =>
    start(async () => {
      setErr(null);
      const fd = new FormData();
      fd.set("email", email);
      scopesToForm(fd, selected);
      const res = await saveDeliveryTeamMember(fd);
      if (res.error) {
        setErr(res.error);
        return;
      }
      setEmail("");
      setSelected(new Set());
      router.refresh();
    });

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-lg border p-4">
        <p className="font-medium">{t("addTitle")}</p>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("emailLabel")}</label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("emailPlaceholder")}
            className="max-w-sm"
            dir="ltr"
          />
        </div>
        <DeskPicker selected={selected} onToggle={toggle} idPrefix="new" />
        <p className="text-muted-foreground text-xs">{t("headNote")}</p>
        {err ? (
          <p className="text-destructive text-sm">{t(`err_${err}`)}</p>
        ) : null}
        <Button size="sm" onClick={add} disabled={pending || !email.trim()}>
          <UserPlus className="size-4" /> {t("add")}
        </Button>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">{t("rosterTitle")}</h2>
        {members.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border border-dashed py-14 text-center text-sm">
            {t("empty")}
          </div>
        ) : (
          <ul className="space-y-3">
            {members.map((m) => (
              <MemberRow key={m.id} member={m} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
