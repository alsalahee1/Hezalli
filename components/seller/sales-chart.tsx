// A dependency-free daily-sales bar chart. Pure presentational server
// component: bars scale to the window's peak day; empty days render as a thin
// baseline so the series stays continuous.
export function SalesChart({
  data,
  money,
}: {
  data: { day: string; total: number }[];
  money: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const peak = data.reduce((a, b) => (b.total > a.total ? b : a), data[0]);

  return (
    <div className="bg-card rounded-lg border p-5">
      <div className="flex items-end justify-between">
        <h2 className="font-medium">
          {/* label supplied by caller via aria; keep chrome minimal */}
          <span className="sr-only">Sales chart</span>
        </h2>
        {peak && peak.total > 0 ? (
          <p className="text-muted-foreground text-xs">
            {money(peak.total)} · {peak.day.slice(5)}
          </p>
        ) : null}
      </div>
      <div
        className="mt-3 flex h-40 items-end gap-[2px]"
        role="img"
        aria-label="Daily sales for the selected period"
      >
        {data.map((d) => (
          <div
            key={d.day}
            className="group relative flex-1"
            style={{ height: "100%" }}
          >
            <div
              className="bg-primary/15 hover:bg-primary/30 absolute inset-x-0 bottom-0 rounded-t-sm transition-colors"
              style={{
                height: `${Math.max(2, (d.total / max) * 100)}%`,
              }}
            />
            <span className="pointer-events-none absolute -top-7 left-1/2 z-10 hidden -translate-x-1/2 rounded bg-black/80 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-white group-hover:block">
              {d.day.slice(5)} · {money(d.total)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
