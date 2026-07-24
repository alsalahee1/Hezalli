"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { usePathname, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Cashier-facing amount entry for a charge. Submitting pushes the amount (and
// optional note) into the URL query, so the server re-renders the pay QR for
// that amount. Clearing resets to an empty charge screen.
export function ChargeAmountForm({
  initialAmount = "",
  initialNote = "",
  hasCharge = false,
}: {
  initialAmount?: string;
  initialNote?: string;
  hasCharge?: boolean;
}) {
  const t = useTranslations("Merchant");
  const router = useRouter();
  const pathname = usePathname();
  const [amount, setAmount] = useState(initialAmount);
  const [note, setNote] = useState(initialNote);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    const params = new URLSearchParams({ amount: String(n) });
    if (note.trim()) params.set("note", note.trim());
    router.replace(`${pathname}?${params.toString()}`);
  };

  const clear = () => {
    setAmount("");
    setNote("");
    router.replace(pathname);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="charge-amount">{t("chargeAmountLabel")}</Label>
        <Input
          id="charge-amount"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          dir="ltr"
          className="text-center text-2xl font-bold"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="charge-note">{t("chargeNoteLabel")}</Label>
        <Input
          id="charge-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("chargeNotePh")}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="lg" className="flex-1" disabled={!amount}>
          {t("chargeShowQr")}
        </Button>
        {hasCharge ? (
          <Button type="button" size="lg" variant="outline" onClick={clear}>
            {t("chargeNew")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
