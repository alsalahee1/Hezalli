"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { importProductsCsv } from "@/lib/actions/seller-tools";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

const SAMPLE =
  "title_en,title_ar,category_slug,price,stock,description_en\nWireless Mouse,فأرة لاسلكية,electronics,12.5,40,Ergonomic wireless mouse";

export function CsvImport() {
  const t = useTranslations("SellerTools");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<
    { created: number; errors: string[] } | { error: string } | null
  >(null);

  const run = () =>
    start(async () => {
      setResult(null);
      const res = await importProductsCsv(csv);
      if (res.error) setResult({ error: res.error });
      else {
        setResult({ created: res.created ?? 0, errors: res.errors ?? [] });
        router.refresh();
      }
    });

  return (
    <section className="space-y-3 rounded-lg border p-5">
      <div>
        <h2 className="font-medium">{t("csvTitle")}</h2>
        <p className="text-muted-foreground text-sm">{t("csvDesc")}</p>
      </div>
      <p className="text-muted-foreground font-mono text-xs">
        {t("csvHeader")}: title_en, title_ar, category_slug, price, stock,
        description_en
      </p>
      <textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        placeholder={SAMPLE}
        rows={7}
        className="bg-background w-full rounded-md border p-3 font-mono text-xs"
      />
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={run} disabled={pending || !csv.trim()}>
          {pending ? t("importing") : t("import")}
        </Button>
        <button
          type="button"
          className="text-muted-foreground flex min-h-9 items-center px-1 text-xs hover:underline"
          onClick={() => setCsv(SAMPLE)}
        >
          {t("csvSample")}
        </button>
      </div>
      {result ? (
        "error" in result ? (
          <p className="text-destructive text-sm">{t(`err_${result.error}`)}</p>
        ) : (
          <div className="text-sm">
            <p className="text-emerald-600">
              {t("csvCreated", { count: result.created })}
            </p>
            {result.errors.length > 0 ? (
              <ul className="text-muted-foreground mt-1 list-disc ps-5 text-xs">
                {result.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )
      ) : null}
    </section>
  );
}
