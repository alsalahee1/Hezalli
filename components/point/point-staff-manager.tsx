"use client";

import { useState, useTransition } from "react";
import { Crown, Pause, Play, QrCode, Trash2, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  addPointStaff,
  addPointStaffByUserId,
  removePointStaff,
  setPointStaffActive,
  setPointStaffRole,
} from "@/lib/actions/point-staff";
import { POINT_STAFF_ROLES, type PointStaffRole } from "@/lib/point-access";
import { extractUserId } from "@/lib/qr-identity";
import { useRouter } from "@/i18n/navigation";
import { QrScanSheet } from "@/components/ui/qr-scan-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type StaffRow = {
  id: string;
  userId: string;
  role: PointStaffRole;
  isActive: boolean;
  name: string | null;
  contact: string | null;
  since: string;
};

// Roster + hire form for the hub's team screen. All writes go through the
// owner/manager-gated actions in lib/actions/point-staff.ts; this component
// only renders state and relays their typed error codes.
export function PointStaffManager({
  owner,
  staff,
  selfUserId,
}: {
  owner: { name: string | null; phone: string | null };
  staff: StaffRow[];
  selfUserId: string;
}) {
  const t = useTranslations("Point");
  const router = useRouter();
  const [pending, start] = useTransition();

  const [identifier, setIdentifier] = useState("");
  const [role, setRole] = useState<PointStaffRole>("CASHIER");
  const [error, setError] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  // Two-tap remove: first tap arms the row, second confirms.
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok?: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.error) setError(res.error);
      else router.refresh();
    });

  const roleLabel = (r: PointStaffRole) => t(`staffRole_${r}`);
  const errorText = (code: string) => {
    const known = [
      "userNotFound",
      "alreadyStaff",
      "staffElsewhere",
      "ownsPoint",
      "staffLimit",
      "isSelf",
      "badRole",
      "notFound",
      "forbidden",
    ];
    return known.includes(code) ? t(`staffErr_${code}`) : t("staffErr_generic");
  };

  // Scan handler for the QR sheet: decode the member's identity code, hire them
  // with the currently-selected role, and report back. Returns an error message
  // to keep the camera scanning, or null on success (we close the sheet).
  const onScan = async (raw: string): Promise<string | null> => {
    const userId = extractUserId(raw);
    if (!userId) return t("staffScanNotCode");
    const res = await addPointStaffByUserId(userId, role);
    if (res.ok) {
      setScanOpen(false);
      router.refresh();
      return null;
    }
    return errorText(res.error ?? "generic");
  };

  return (
    <div className="space-y-4">
      {/* Hire: attach an existing Hezalli account by phone or email. */}
      <form
        className="space-y-3 rounded-xl border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!identifier.trim()) return;
          run(async () => {
            const res = await addPointStaff(identifier, role);
            if (res.ok) setIdentifier("");
            return res;
          });
        }}
      >
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <UserPlus className="size-4" /> {t("staffAddTitle")}
        </p>
        <p className="text-muted-foreground text-xs">{t("staffAddHint")}</p>

        {/* Scan-first: point the camera at the member's personal Hezalli QR
            (their wallet "My code") to add them with the selected job below —
            no phone number to read out. Typing stays as the fallback. */}
        <button
          type="button"
          onClick={() => {
            setError(null);
            setScanOpen(true);
          }}
          className="border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 text-sm font-semibold"
        >
          <QrCode className="size-4" /> {t("staffScanBtn")}
        </button>

        <div className="flex items-center gap-3">
          <span className="bg-border h-px flex-1" />
          <span className="text-muted-foreground text-xs">{t("staffOr")}</span>
          <span className="bg-border h-px flex-1" />
        </div>

        <Input
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder={t("staffIdentifierPlaceholder")}
          dir="ltr"
        />
        <div className="flex items-center gap-2">
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value as PointStaffRole)}
            className="min-w-0 flex-1"
          >
            {POINT_STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </Select>
          <Button
            type="submit"
            disabled={pending || !identifier.trim()}
            className="shrink-0 rounded-full"
          >
            {t("staffAddBtn")}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          {t(`staffRoleDesc_${role}`)}
        </p>
      </form>

      {error ? (
        <p className="text-destructive text-sm">{errorText(error)}</p>
      ) : null}

      <ul className="divide-y rounded-xl border">
        {/* The owner heads the roster — not a row anyone can edit. */}
        <li className="flex items-center gap-3 px-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Crown className="size-4 text-amber-500" />
              {owner.name ?? t("staffOwnerFallback")}
            </p>
            {owner.phone ? (
              <p className="text-muted-foreground text-xs" dir="ltr">
                {owner.phone}
              </p>
            ) : null}
          </div>
          <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
            {t("staffOwnerBadge")}
          </span>
        </li>

        {staff.map((s) => {
          const isSelf = s.userId === selfUserId;
          return (
            <li key={s.id} className="space-y-2 px-3 py-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {s.name ?? s.contact ?? "—"}
                    {isSelf ? (
                      <span className="text-muted-foreground text-xs">
                        {" "}
                        · {t("staffYou")}
                      </span>
                    ) : null}
                  </p>
                  <p
                    className="text-muted-foreground truncate text-xs"
                    dir="ltr"
                  >
                    {s.contact}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t("staffSince", { date: s.since })}
                  </p>
                </div>
                <span
                  className={
                    s.isActive
                      ? "rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium"
                  }
                >
                  {s.isActive ? t("staffActive") : t("staffPaused")}
                </span>
              </div>

              {isSelf ? null : (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={s.role}
                    disabled={pending}
                    onChange={(e) =>
                      run(() => setPointStaffRole(s.id, e.target.value))
                    }
                    className="border-input bg-background min-h-10 rounded-lg border px-2 py-2 text-xs disabled:opacity-50"
                  >
                    {POINT_STAFF_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() => setPointStaffActive(s.id, !s.isActive))
                    }
                    className="text-muted-foreground hover:text-foreground inline-flex min-h-10 items-center gap-1 rounded-full border px-3 py-2 text-xs font-medium disabled:opacity-50"
                  >
                    {s.isActive ? (
                      <>
                        <Pause className="size-3.5" /> {t("staffPauseBtn")}
                      </>
                    ) : (
                      <>
                        <Play className="size-3.5" /> {t("staffResumeBtn")}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (confirmRemove !== s.id) {
                        setConfirmRemove(s.id);
                        return;
                      }
                      setConfirmRemove(null);
                      run(() => removePointStaff(s.id));
                    }}
                    className={
                      confirmRemove === s.id
                        ? "bg-destructive inline-flex min-h-10 items-center gap-1 rounded-full px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        : "text-destructive inline-flex min-h-10 items-center gap-1 rounded-full border px-3 py-2 text-xs font-medium disabled:opacity-50"
                    }
                  >
                    <Trash2 className="size-3.5" />
                    {confirmRemove === s.id
                      ? t("staffRemoveConfirm")
                      : t("staffRemoveBtn")}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {staff.length === 0 ? (
        <p className="text-muted-foreground text-center text-sm">
          {t("staffEmpty")}
        </p>
      ) : null}

      <QrScanSheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        title={t("staffScanTitle")}
        // Remind the owner which job the scanned member will get — it's the one
        // selected in the form behind the sheet.
        scanHint={t("staffScanHint", { role: roleLabel(role) })}
        startingLabel={t("staffScanStarting")}
        cameraUnavailableLabel={t("staffScanNoCamera")}
        manualLabel={t("staffScanManualLabel")}
        manualPlaceholder="u/…"
        manualSubmitLabel={t("staffAddBtn")}
        closeLabel={t("staffScanClose")}
        busyLabel={t("staffScanAdding")}
        onScan={onScan}
      />
    </div>
  );
}
