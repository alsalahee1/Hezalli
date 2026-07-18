// Fail-fast environment validation. Runs once at server boot (via
// instrumentation.ts) so a misconfigured production deploy crashes loudly
// instead of failing mysteriously on the first request.
const REQUIRED_IN_PRODUCTION = ["DATABASE_URL", "AUTH_SECRET"];

export function assertEnv(): void {
  if (process.env.NODE_ENV !== "production") return;
  const missing = REQUIRED_IN_PRODUCTION.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        `Set them in the host's environment before deploying.`,
    );
  }
}
