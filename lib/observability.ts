// Central error-capture seam. By default it logs to the server console (visible
// in Vercel logs). To enable Sentry (or another provider), install the SDK and
// forward the error here, gated on the DSN env var — no other code changes are
// needed because every server error flows through instrumentation.ts →
// captureError.
export function captureError(
  error: unknown,
  meta?: Record<string, unknown>,
): void {
  console.error("[observability] server error:", error, meta ?? "");

  // Plug-in point (Step 16.2):
  //   if (process.env.SENTRY_DSN) {
  //     Sentry.captureException(error, { extra: meta });
  //   }
}
