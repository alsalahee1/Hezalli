"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Pencil, Plus, Trash2, Wand2 } from "lucide-react";

import {
  deleteFaq,
  draftFaqAnswer,
  saveFaq,
  toggleFaq,
} from "@/lib/actions/faq";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type FaqRow = {
  id: string;
  question: string;
  answer: string;
  bot: string;
  locale: string;
  enabled: boolean;
  hitCount: number;
};

type Draft = {
  id?: string;
  question: string;
  answer: string;
  bot: string;
  locale: string;
  enabled: boolean;
};

const emptyDraft = (over: Partial<Draft> = {}): Draft => ({
  question: "",
  answer: "",
  bot: "all",
  locale: "all",
  enabled: true,
  ...over,
});

export function FaqManager({
  faqs,
  botNames,
  initialDraft,
}: {
  faqs: FaqRow[];
  botNames: Record<string, string>;
  // Pre-filled question (e.g. opened from a "needs attention" stat).
  initialDraft?: { question: string; bot: string };
}) {
  const t = useTranslations("AdminFaq");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [drafting, setDrafting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(
    initialDraft
      ? emptyDraft({
          question: initialDraft.question,
          bot: initialDraft.bot,
        })
      : null,
  );

  const scopeLabel = (bot: string, locale: string) => {
    const b = bot === "all" ? t("allChars") : (botNames[bot] ?? bot);
    const l = locale === "all" ? t("allLangs") : locale.toUpperCase();
    return `${b} · ${l}`;
  };

  const save = () => {
    if (!draft) return;
    start(async () => {
      setErr(null);
      const res = await saveFaq(draft);
      if (res.error) setErr(res.error);
      else {
        setDraft(null);
        router.refresh();
      }
    });
  };

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setErr(null);
      const res = await fn();
      if (res.error) setErr(res.error);
      else router.refresh();
    });

  // Ask the AI to draft an answer for the current question; admin edits/approves.
  const draft2 = async () => {
    if (!draft?.question.trim()) return;
    setErr(null);
    setDrafting(true);
    try {
      const res = await draftFaqAnswer({
        question: draft.question,
        bot: draft.bot,
        locale: draft.locale,
      });
      if (res.error) setErr(res.error);
      else if (res.answer)
        setDraft((d) => (d ? { ...d, answer: res.answer! } : d));
    } finally {
      setDrafting(false);
    }
  };

  return (
    <div className="space-y-5">
      {!draft ? (
        <Button onClick={() => setDraft(emptyDraft())}>
          <Plus className="size-4" />
          {t("add")}
        </Button>
      ) : (
        <section className="space-y-3 rounded-lg border p-4">
          <p className="font-medium">
            {draft.id ? t("editTitle") : t("addTitle")}
          </p>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t("question")}</span>
            <Input
              value={draft.question}
              onChange={(e) => setDraft({ ...draft, question: e.target.value })}
              placeholder={t("questionPlaceholder")}
            />
          </label>
          <label className="block space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{t("answer")}</span>
              <button
                type="button"
                onClick={draft2}
                disabled={drafting || pending || !draft.question.trim()}
                className="text-primary inline-flex items-center gap-1.5 text-xs font-medium hover:underline disabled:opacity-50"
              >
                {drafting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Wand2 className="size-3.5" />
                )}
                {drafting ? t("drafting") : t("draft")}
              </button>
            </div>
            <textarea
              value={draft.answer}
              onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
              rows={4}
              maxLength={4000}
              placeholder={t("answerPlaceholder")}
              className="border-input w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            />
            <span className="text-muted-foreground block text-xs">
              {t("draftHint")}
            </span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-sm font-medium">{t("character")}</span>
              <select
                value={draft.bot}
                onChange={(e) => setDraft({ ...draft, bot: e.target.value })}
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              >
                <option value="all">{t("allChars")}</option>
                {Object.entries(botNames).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">{t("language")}</span>
              <select
                value={draft.locale}
                onChange={(e) => setDraft({ ...draft, locale: e.target.value })}
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              >
                <option value="all">{t("allLangs")}</option>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={draft.enabled}
              onChange={(e) =>
                setDraft({ ...draft, enabled: e.target.checked })
              }
            />
            {t("enabled")}
          </label>
          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={pending}>
              {pending ? t("saving") : t("save")}
            </Button>
            <Button variant="outline" onClick={() => setDraft(null)}>
              {t("cancel")}
            </Button>
            {err ? (
              <span className="text-destructive text-sm">
                {t(`err_${err}`)}
              </span>
            ) : null}
          </div>
        </section>
      )}

      {faqs.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
          {t("empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {faqs.map((f) => (
            <li
              key={f.id}
              className="flex items-start gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium">{f.question}</p>
                <p className="text-muted-foreground line-clamp-2 text-sm">
                  {f.answer}
                </p>
                <p className="text-muted-foreground text-xs">
                  {scopeLabel(f.bot, f.locale)} ·{" "}
                  {f.hitCount > 0
                    ? t("used", { n: f.hitCount })
                    : t("neverUsed")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <label
                  className="me-1 flex items-center gap-1 text-xs"
                  title={t("enabled")}
                >
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={f.enabled}
                    disabled={pending}
                    onChange={(e) =>
                      run(() => toggleFaq(f.id, e.target.checked))
                    }
                  />
                </label>
                <button
                  type="button"
                  aria-label={t("edit")}
                  onClick={() => setDraft({ ...f })}
                  className="hover:bg-muted rounded-md p-1.5"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={t("delete")}
                  onClick={() => {
                    if (confirm(t("confirmDelete"))) run(() => deleteFaq(f.id));
                  }}
                  className="hover:bg-destructive/10 text-destructive rounded-md p-1.5"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
