// Next.js instrumentation: runs once when the server process starts, and hooks
// every server-side error. Used here for fail-fast env validation and a central
// error-capture seam (Sentry plug-in point — see lib/observability.ts).
export async function register() {
  const { assertEnv } = await import("./lib/env");
  assertEnv();
}

export async function onRequestError(
  error: unknown,
  request: unknown,
  context: unknown,
) {
  const { captureError } = await import("./lib/observability");
  captureError(error, { request, context });
}
