"use client";

import { useTranslations } from "next-intl";

export function DashboardHome({ variant }: { variant: "seller" | "admin" }) {
  const ns = variant === "seller" ? "Seller" : "Admin";
  const t = useTranslations(ns);
  const c = useTranslations("Common");

  const cards =
    variant === "seller"
      ? ["products", "orders", "returns", "promotions"]
      : ["users", "sellers", "orders", "disputes"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("dashboard")}</h1>
        <p className="text-sm text-muted-foreground">{c("comingSoonDesc")}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((key) => (
          <div key={key} className="rounded-lg border bg-card p-4 text-card-foreground">
            <p className="text-sm text-muted-foreground">{t(key)}</p>
            <p className="mt-1 text-2xl font-semibold">—</p>
          </div>
        ))}
      </div>
    </div>
  );
}
