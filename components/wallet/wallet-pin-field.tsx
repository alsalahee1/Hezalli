"use client";

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";

// Reusable PIN input for wallet outflow forms. When the user hasn't set a PIN
// yet it renders a notice instead — the form disables submit until one exists.
export function WalletPinField({
  hasPin,
  value,
  onChange,
}: {
  hasPin: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useTranslations("Wallet");
  if (!hasPin) {
    return (
      <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs text-amber-700 dark:text-amber-400">
        {t("pinRequiredNotice")}
      </p>
    );
  }
  return (
    <Input
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={6}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      placeholder={t("pinPlaceholder")}
      dir="ltr"
    />
  );
}
