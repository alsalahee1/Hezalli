// A standard top-down floor plan for a Hezalli Point center, drawn as inline
// SVG so it scales crisply and follows the light/dark theme (fills use the
// tone palette at low opacity; text/borders use currentColor tokens). It is
// language-neutral by design: zones carry a NUMBER badge and a short centered
// label, and the page renders the full translated legend beside it — that
// keeps Arabic (RTL) clean without flipping the diagram itself.

export type ZoneTone =
  "sky" | "violet" | "emerald" | "amber" | "rose" | "slate" | "indigo";

// Full class strings (never interpolated) so Tailwind keeps every variant.
const ZONE_FILL: Record<ZoneTone, string> = {
  sky: "fill-sky-500/12 stroke-sky-500/60",
  violet: "fill-violet-500/12 stroke-violet-500/60",
  emerald: "fill-emerald-500/12 stroke-emerald-500/60",
  amber: "fill-amber-500/12 stroke-amber-500/60",
  rose: "fill-rose-500/12 stroke-rose-500/60",
  slate: "fill-slate-500/12 stroke-slate-500/60",
  indigo: "fill-indigo-500/12 stroke-indigo-500/60",
};
const BADGE_FILL: Record<ZoneTone, string> = {
  sky: "fill-sky-500",
  violet: "fill-violet-500",
  emerald: "fill-emerald-500",
  amber: "fill-amber-500",
  rose: "fill-rose-500",
  slate: "fill-slate-500",
  indigo: "fill-indigo-500",
};

type Zone = {
  n: number;
  tone: ZoneTone;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
};

function ZoneBox({ z }: { z: Zone }) {
  const cx = z.x + z.w / 2;
  return (
    <g>
      <rect
        x={z.x}
        y={z.y}
        width={z.w}
        height={z.h}
        rx={12}
        strokeWidth={2}
        className={ZONE_FILL[z.tone]}
      />
      {/* Number medallion, top-start corner of the zone. */}
      <circle
        cx={z.x + 20}
        cy={z.y + 20}
        r={13}
        className={BADGE_FILL[z.tone]}
      />
      <text
        x={z.x + 20}
        y={z.y + 20}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-white text-[15px] font-bold"
      >
        {z.n}
      </text>
      {/* Centered short label. */}
      <text
        x={cx}
        y={z.y + z.h / 2 + 6}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-foreground text-[15px] font-semibold"
      >
        {z.label}
      </text>
    </g>
  );
}

export type FloorPlanLabels = {
  building: string;
  entrance: string;
  z1: string; // receiving / drop-off
  z2: string; // sorting table
  z3: string; // shelves / storage
  z4: string; // pickup counter
  z5: string; // cash desk
  z6: string; // driver dispatch
  z7: string; // returns corner
  flowIn: string; // seller / driver drop
  flowOut: string; // buyer / driver out
};

export function CenterFloorPlan({ labels }: { labels: FloorPlanLabels }) {
  // Portrait composition (tall, two columns) so the whole plan fits a phone's
  // width with no sideways scrolling — the diagram reads top-to-bottom like the
  // parcel flow itself. Left column: receiving → pickup → cash → returns; right
  // column: sorting → shelves (tall) → dispatch. Same seven numbered zones and
  // tones as before; only the arrangement changed.
  const zones: Zone[] = [
    { n: 1, tone: "sky", x: 34, y: 64, w: 180, h: 118, label: labels.z1 },
    { n: 2, tone: "slate", x: 246, y: 64, w: 180, h: 118, label: labels.z2 },
    { n: 3, tone: "violet", x: 246, y: 210, w: 180, h: 264, label: labels.z3 },
    { n: 4, tone: "emerald", x: 34, y: 210, w: 180, h: 118, label: labels.z4 },
    { n: 5, tone: "amber", x: 34, y: 356, w: 180, h: 118, label: labels.z5 },
    { n: 6, tone: "indigo", x: 246, y: 502, w: 180, h: 118, label: labels.z6 },
    { n: 7, tone: "rose", x: 34, y: 502, w: 180, h: 118, label: labels.z7 },
  ];

  return (
    <svg
      viewBox="0 0 460 720"
      role="img"
      aria-label={labels.building}
      className="text-muted-foreground mx-auto block h-auto w-full max-w-sm"
    >
      <defs>
        <marker
          id="fp-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" className="fill-current" />
        </marker>
      </defs>

      {/* Building shell. */}
      <rect
        x={8}
        y={8}
        width={444}
        height={704}
        rx={18}
        className="fill-muted/30 stroke-current/40"
        strokeWidth={2}
      />

      {/* Flow caption (top). */}
      <text
        x={230}
        y={40}
        textAnchor="middle"
        className="fill-muted-foreground text-[13px] font-medium"
      >
        {labels.flowIn}
      </text>

      {/* Parcel-flow arrows: in → sort → shelves → pickup / dispatch. */}
      <g
        className="stroke-current/50"
        strokeWidth={2.5}
        fill="none"
        markerEnd="url(#fp-arrow)"
      >
        {/* receiving → sorting */}
        <path d="M214,123 L242,123" />
        {/* sorting → shelves */}
        <path d="M336,182 L336,206" />
        {/* shelves → pickup */}
        <path d="M244,300 L216,300" />
        {/* shelves → dispatch */}
        <path d="M336,476 L336,498" />
        {/* pickup → returns, routed down the left gutter so it never crosses
            the cash desk between them */}
        <path d="M90,328 L90,340 L20,340 L20,561 L30,561" />
      </g>

      {zones.map((z) => (
        <ZoneBox key={z.n} z={z} />
      ))}

      {/* Entrance / storefront opening near the bottom edge. */}
      <rect
        x={180}
        y={648}
        width={100}
        height={26}
        rx={6}
        className="fill-background stroke-current/60"
        strokeWidth={2}
      />
      <text
        x={230}
        y={661}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground text-[13px] font-semibold"
      >
        {labels.entrance}
      </text>
    </svg>
  );
}

export type ShelfLabels = {
  rowsLabel: string;
  colsLabel: string;
  example: string; // e.g. "B3"
  exampleCaption: string;
};

// The shelf-coding diagram: lettered rows × numbered bays make a short code
// (A1, B3 …) — exactly the shelfCode an operator types at the receive scan.
export function ShelfCodeDiagram({ labels }: { labels: ShelfLabels }) {
  const rows = ["A", "B", "C"];
  const cols = [1, 2, 3, 4, 5];
  const highlight = { r: "B", c: 3 };
  const cell = 52;
  const ox = 60;
  const oy = 40;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox="0 0 380 250"
        role="img"
        aria-label={labels.exampleCaption}
        className="text-muted-foreground mx-auto block h-auto w-full max-w-md min-w-[320px]"
      >
        {/* Row letters (left). */}
        {rows.map((r, ri) => (
          <text
            key={r}
            x={ox - 22}
            y={oy + ri * cell + cell / 2}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-violet-600 text-[16px] font-bold dark:fill-violet-400"
          >
            {r}
          </text>
        ))}
        {/* Column numbers (top). */}
        {cols.map((c, ci) => (
          <text
            key={c}
            x={ox + ci * cell + cell / 2}
            y={oy - 16}
            textAnchor="middle"
            className="fill-sky-600 text-[16px] font-bold dark:fill-sky-400"
          >
            {c}
          </text>
        ))}
        {/* Grid cells. */}
        {rows.map((r, ri) =>
          cols.map((c, ci) => {
            const on = r === highlight.r && c === highlight.c;
            return (
              <g key={`${r}${c}`}>
                <rect
                  x={ox + ci * cell + 3}
                  y={oy + ri * cell + 3}
                  width={cell - 6}
                  height={cell - 6}
                  rx={7}
                  strokeWidth={2}
                  className={
                    on
                      ? "fill-violet-500 stroke-violet-500"
                      : "fill-muted/40 stroke-current/30"
                  }
                />
                <text
                  x={ox + ci * cell + cell / 2}
                  y={oy + ri * cell + cell / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={
                    on
                      ? "fill-white text-[13px] font-bold"
                      : "fill-muted-foreground text-[12px] font-medium"
                  }
                >
                  {r}
                  {c}
                </text>
              </g>
            );
          }),
        )}
        {/* Axis captions. */}
        <text
          x={ox + (cols.length * cell) / 2}
          y={oy - 30}
          textAnchor="middle"
          className="fill-sky-600 text-[11px] font-semibold dark:fill-sky-400"
        >
          {labels.colsLabel}
        </text>
      </svg>
    </div>
  );
}
