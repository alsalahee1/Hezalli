// Small helpers for reasoning about Prisma error shapes without importing the
// generated client's error classes at every call site. Prisma raises a known
// request error with a stable string `code`; P2002 is a unique-constraint
// violation. We use these to make check-then-write idempotency race-proof: a
// concurrent second writer that trips a unique index is treated as a no-op
// instead of crashing.

/** True when an error is a Prisma unique-constraint violation (code P2002). */
export function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: unknown }).code === "P2002"
  );
}
