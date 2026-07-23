import { Fragment } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

// Visual building blocks specific to the Express showcase page: real product
// screenshots presented in lightweight device frames, plus a roadmap card
// list. Complements components/how/how-blocks.tsx (icon-and-CSS infographics)
// rather than replacing it — this page mixes both.

/** A mobile screenshot in a minimal phone bezel, with a caption below. */
export function PhoneShot({
  src,
  width,
  height,
  alt,
  caption,
  className,
}: {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption?: string;
  className?: string;
}) {
  return (
    <figure className={cn("mx-auto flex max-w-[280px] flex-col", className)}>
      <div className="bg-foreground rounded-[2rem] p-2 shadow-lg">
        <div className="bg-background relative overflow-hidden rounded-[1.5rem] border">
          <span
            aria-hidden
            className="bg-foreground/80 absolute top-1.5 left-1/2 z-10 h-1 w-10 -translate-x-1/2 rounded-full"
          />
          <Image
            src={src}
            width={width}
            height={height}
            alt={alt}
            className="h-auto w-full"
            sizes="280px"
          />
        </div>
      </div>
      {caption ? (
        <figcaption className="text-muted-foreground mt-3 text-center text-xs text-pretty">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** A desktop/admin screenshot in a minimal browser-chrome frame. */
export function DesktopShot({
  src,
  width,
  height,
  alt,
  caption,
  className,
}: {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption?: string;
  className?: string;
}) {
  return (
    <figure className={cn("mx-auto flex max-w-2xl flex-col", className)}>
      <div className="overflow-hidden rounded-xl border shadow-lg">
        <div className="bg-muted flex items-center gap-1.5 border-b px-3 py-2">
          <span className="size-2.5 rounded-full bg-rose-400/70" />
          <span className="size-2.5 rounded-full bg-amber-400/70" />
          <span className="size-2.5 rounded-full bg-emerald-400/70" />
        </div>
        <Image
          src={src}
          width={width}
          height={height}
          alt={alt}
          className="h-auto w-full"
          sizes="(min-width: 768px) 672px, 100vw"
        />
      </div>
      {caption ? (
        <figcaption className="text-muted-foreground mt-3 text-center text-xs text-pretty">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

export type RoadmapItem = {
  status: string;
  title: string;
  text: string;
  /** Rough progress read from the status label — purely visual, no dates implied. */
  tone: "next" | "planned" | "live";
};

const ROADMAP_TONE: Record<RoadmapItem["tone"], string> = {
  next: "border-primary/40 bg-primary/5 text-primary",
  planned: "border-border bg-muted/50 text-muted-foreground",
  live: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

/** Roadmap cards: a status pill + what it is — no fabricated dates. */
export function RoadmapGrid({ items }: { items: RoadmapItem[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item, i) => (
        <div key={i} className="rounded-xl border p-4">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
              ROADMAP_TONE[item.tone],
            )}
          >
            {item.status}
          </span>
          <p className="mt-2.5 font-semibold">{item.title}</p>
          <p className="text-muted-foreground mt-1 text-sm">{item.text}</p>
        </div>
      ))}
    </div>
  );
}

export type ConfigRow = {
  key: string;
  value: string;
  desc: string;
};

/** Operator settings reference: grouped, code-styled keys, RTL-safe. */
export function ConfigTable({
  groups,
  colSetting,
  colDefault,
  colDesc,
}: {
  groups: { label: string; rows: ConfigRow[] }[];
  colSetting: string;
  colDefault: string;
  colDesc: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border shadow-sm">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="bg-muted/50 border-b text-start">
            <th className="text-muted-foreground px-4 py-2.5 text-start text-xs font-semibold tracking-wide uppercase">
              {colSetting}
            </th>
            <th className="text-muted-foreground px-4 py-2.5 text-start text-xs font-semibold tracking-wide uppercase">
              {colDefault}
            </th>
            <th className="text-muted-foreground px-4 py-2.5 text-start text-xs font-semibold tracking-wide uppercase">
              {colDesc}
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.label}>
              <tr className="bg-primary/5">
                <td
                  colSpan={3}
                  className="text-primary px-4 py-1.5 text-xs font-semibold"
                >
                  {g.label}
                </td>
              </tr>
              {g.rows.map((r) => (
                <tr key={r.key} className="border-b last:border-0">
                  <td className="px-4 py-2.5">
                    <code
                      dir="ltr"
                      className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs whitespace-nowrap"
                    >
                      {r.key}
                    </code>
                  </td>
                  <td className="px-4 py-2.5">
                    <code
                      dir="ltr"
                      className="text-primary bg-primary/10 rounded px-1.5 py-0.5 font-mono text-xs"
                    >
                      {r.value}
                    </code>
                  </td>
                  <td className="text-muted-foreground px-4 py-2.5">
                    {r.desc}
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
