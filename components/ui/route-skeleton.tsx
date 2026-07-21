// Shared loading placeholder for route-level loading.tsx boundaries, so client
// navigation shows immediate feedback instead of a dead page while the server
// renders. Purely decorative — hidden from assistive tech.
export function RouteSkeleton({
  variant = "page",
}: {
  variant?: "page" | "grid";
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6" aria-hidden>
      <div className="bg-muted mb-6 h-8 w-48 animate-pulse rounded" />
      {variant === "grid" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="rounded-lg border">
              <div className="bg-muted aspect-square animate-pulse rounded-t-lg" />
              <div className="space-y-2 p-3">
                <div className="bg-muted h-4 w-full animate-pulse rounded" />
                <div className="bg-muted h-4 w-2/3 animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-muted h-16 w-full animate-pulse rounded-lg"
            />
          ))}
        </div>
      )}
    </div>
  );
}
