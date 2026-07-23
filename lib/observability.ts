// Central error-capture seam. Always logs to the server console (visible in
// Vercel/host logs); when SENTRY_DSN is set, each error is also reported to
// Sentry over its envelope HTTP API — no SDK dependency, so the transport
// works identically in the Node and edge runtimes and adds zero bundle
// weight. Reporting is fire-and-forget: a Sentry outage can never break a
// request.
type ParsedDsn = { endpoint: string; key: string };

function parseDsn(dsn: string): ParsedDsn | null {
  // DSN shape: https://<publicKey>@<host>/<projectId>
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/\//g, "");
    if (!u.username || !projectId) return null;
    return {
      endpoint: `${u.protocol}//${u.host}/api/${projectId}/envelope/`,
      key: u.username,
    };
  } catch {
    return null;
  }
}

function toEvent(error: unknown, meta?: Record<string, unknown>) {
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: Date.now() / 1000,
    platform: "node",
    level: "error",
    environment: process.env.NODE_ENV ?? "development",
    exception: {
      values: [
        {
          type: err.name,
          value: err.message,
          stacktrace: err.stack
            ? {
                frames: err.stack
                  .split("\n")
                  .slice(1, 51)
                  .map((line) => ({ function: line.trim() }))
                  .reverse(),
              }
            : undefined,
        },
      ],
    },
    extra: meta ?? {},
  };
}

export function captureError(
  error: unknown,
  meta?: Record<string, unknown>,
): void {
  console.error("[observability] server error:", error, meta ?? "");

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  const parsed = parseDsn(dsn);
  if (!parsed) return;

  const event = toEvent(error, meta);
  const envelope =
    JSON.stringify({
      event_id: event.event_id,
      sent_at: new Date().toISOString(),
    }) +
    "\n" +
    JSON.stringify({ type: "event" }) +
    "\n" +
    JSON.stringify(event) +
    "\n";

  void fetch(parsed.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-sentry-envelope",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${parsed.key}, sentry_client=hezalli/1.0`,
    },
    body: envelope,
  }).catch(() => {
    // Reporting must never throw into the request path.
  });
}
