import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// Visual building blocks for the per-role "How it works" pages: an
// infographic look built from icons + CSS only (no images, RTL-safe).
// Tailwind can't see interpolated class names, so tones map to full strings.

export type Tone = "emerald" | "amber" | "sky" | "violet" | "rose" | "slate";

const TONES: Record<
  Tone,
  { chip: string; ring: string; text: string; soft: string }
> = {
  emerald: {
    chip: "bg-emerald-500 text-white",
    ring: "border-emerald-500/40 bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-400",
    soft: "bg-emerald-500/10",
  },
  amber: {
    chip: "bg-amber-500 text-white",
    ring: "border-amber-500/40 bg-amber-500/10",
    text: "text-amber-700 dark:text-amber-400",
    soft: "bg-amber-500/10",
  },
  sky: {
    chip: "bg-sky-500 text-white",
    ring: "border-sky-500/40 bg-sky-500/10",
    text: "text-sky-700 dark:text-sky-400",
    soft: "bg-sky-500/10",
  },
  violet: {
    chip: "bg-violet-500 text-white",
    ring: "border-violet-500/40 bg-violet-500/10",
    text: "text-violet-700 dark:text-violet-400",
    soft: "bg-violet-500/10",
  },
  rose: {
    chip: "bg-rose-500 text-white",
    ring: "border-rose-500/40 bg-rose-500/10",
    text: "text-rose-700 dark:text-rose-400",
    soft: "bg-rose-500/10",
  },
  slate: {
    chip: "bg-slate-600 text-white",
    ring: "border-slate-500/40 bg-slate-500/10",
    text: "text-slate-700 dark:text-slate-300",
    soft: "bg-slate-500/10",
  },
};

/** Page header: big icon medallion + title + one-line promise. */
export function HowHero({
  icon: Icon,
  title,
  subtitle,
  tone = "sky",
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  tone?: Tone;
}) {
  const c = TONES[tone];
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-2xl border p-5 sm:p-6",
        c.ring,
      )}
    >
      <span
        className={cn(
          "flex size-14 shrink-0 items-center justify-center rounded-2xl shadow-sm",
          c.chip,
        )}
      >
        <Icon className="size-7" />
      </span>
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
          {title}
        </h1>
        <p className="text-muted-foreground mt-0.5 text-sm">{subtitle}</p>
      </div>
    </div>
  );
}

export function HowSection({ title }: { title: string }) {
  return (
    <h2 className="flex items-center gap-3 pt-2 text-base font-semibold">
      <span className="bg-border h-px flex-1" aria-hidden />
      {title}
      <span className="bg-border h-px flex-1" aria-hidden />
    </h2>
  );
}

export type FlowStep = {
  icon: LucideIcon;
  title: string;
  text: string;
  tone?: Tone;
};

/** Numbered journey: icon medallions joined by a line — the "road map". */
export function HowFlow({ steps }: { steps: FlowStep[] }) {
  return (
    <ol className="relative space-y-0">
      {steps.map((s, i) => {
        const c = TONES[s.tone ?? "sky"];
        const last = i === steps.length - 1;
        return (
          <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
            {/* connecting spine */}
            {!last ? (
              <span
                aria-hidden
                className="bg-border absolute start-6 top-12 bottom-0 w-px"
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 flex size-12 shrink-0 items-center justify-center rounded-full shadow-sm",
                c.chip,
              )}
            >
              <s.icon className="size-6" />
              <span className="bg-background text-foreground absolute -end-1 -top-1 flex size-5 items-center justify-center rounded-full border text-[11px] font-bold">
                {i + 1}
              </span>
            </span>
            <div className="min-w-0 pt-1">
              <p className={cn("font-semibold", c.text)}>{s.title}</p>
              <p className="text-muted-foreground text-sm">{s.text}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export type FeatureItem = {
  icon: LucideIcon;
  title: string;
  text: string;
  tone?: Tone;
};

/** Feature cards: icon tile + name + how it works, in a responsive grid. */
export function HowGrid({ items }: { items: FeatureItem[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((f, i) => {
        const c = TONES[f.tone ?? "slate"];
        return (
          <div key={i} className="flex gap-3 rounded-xl border p-4">
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-lg",
                c.soft,
              )}
            >
              <f.icon className={cn("size-5", c.text)} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{f.title}</p>
              <p className="text-muted-foreground mt-0.5 text-sm">{f.text}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** a + b + c = result, as colored chips — the credit-limit infographic. */
export function HowFormula({
  parts,
  result,
  caption,
}: {
  parts: { label: string; tone: Tone }[];
  result: string;
  caption: string;
}) {
  return (
    <div className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        {parts.map((p, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 ? (
              <span className="text-muted-foreground text-lg font-bold">+</span>
            ) : null}
            <span
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-semibold",
                TONES[p.tone].chip,
              )}
            >
              {p.label}
            </span>
          </span>
        ))}
        <span className="text-muted-foreground text-lg font-bold">=</span>
        <span className="bg-foreground text-background rounded-lg px-3 py-1.5 text-sm font-bold">
          {result}
        </span>
      </div>
      <p className="text-muted-foreground mt-2 text-xs">{caption}</p>
    </div>
  );
}

/** Traffic-light legend: what green / amber / red mean for this role. */
export function HowBadges({
  items,
}: {
  items: { tone: Tone; label: string; text: string }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map((b, i) => {
        const c = TONES[b.tone];
        return (
          <div key={i} className={cn("rounded-xl border p-4", c.ring)}>
            <p className={cn("flex items-center gap-2 font-semibold", c.text)}>
              <span
                className={cn("inline-block size-2.5 rounded-full", c.chip)}
              />
              {b.label}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">{b.text}</p>
          </div>
        );
      })}
    </div>
  );
}
