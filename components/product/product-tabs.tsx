"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { StarRating } from "@/components/product/star-rating";

export type Spec = { label: string; value: string };

export function ProductTabs({
  description,
  specs,
  shipping,
  returns,
  ratingAvg,
  ratingCount,
}: {
  description: string;
  specs: Spec[];
  shipping: string;
  returns: string;
  ratingAvg: number;
  ratingCount: number;
}) {
  const t = useTranslations("Product");
  const tabs = [
    { key: "description", label: t("tabDescription") },
    { key: "specs", label: t("tabSpecs") },
    { key: "reviews", label: t("tabReviews") },
    { key: "shipping", label: t("tabShipping") },
  ] as const;
  const [active, setActive] =
    useState<(typeof tabs)[number]["key"]>("description");

  return (
    <div className="rounded-lg border">
      <div className="flex overflow-x-auto border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            className={cn(
              "border-b-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors",
              active === tab.key
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4 text-sm leading-relaxed">
        {active === "description" ? (
          <p className="text-muted-foreground whitespace-pre-line">
            {description || t("noDescription")}
          </p>
        ) : null}

        {active === "specs" ? (
          <dl className="divide-y">
            {specs.map((s) => (
              <div key={s.label} className="flex gap-4 py-2">
                <dt className="text-muted-foreground w-40 shrink-0">
                  {s.label}
                </dt>
                <dd className="font-medium">{s.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {active === "reviews" ? (
          <div className="flex flex-col gap-2">
            {ratingCount > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">
                  {ratingAvg.toFixed(1)}
                </span>
                <StarRating rating={ratingAvg} size={18} />
                <span className="text-muted-foreground">({ratingCount})</span>
              </div>
            ) : null}
            <p className="text-muted-foreground">{t("reviewsComingSoon")}</p>
          </div>
        ) : null}

        {active === "shipping" ? (
          <div className="flex flex-col gap-3">
            <div>
              <h4 className="mb-1 font-medium">{t("tabShipping")}</h4>
              <p className="text-muted-foreground">{shipping}</p>
            </div>
            <div>
              <h4 className="mb-1 font-medium">{t("returnsTitle")}</h4>
              <p className="text-muted-foreground">{returns}</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
