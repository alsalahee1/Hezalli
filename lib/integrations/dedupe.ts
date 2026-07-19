// Generic in-memory "seen id" guard shared by webhook handlers, to drop
// redelivered events within a single server instance. Best-effort — the
// fast-ACK in each webhook is the primary defense against redelivery.
import "server-only";

const seen = new Set<string>();
const order: string[] = [];
const MAX = 4000;

/** Returns true if this id was already handled (and records it otherwise). */
export function seenEventId(id: string): boolean {
  if (seen.has(id)) return true;
  seen.add(id);
  order.push(id);
  if (order.length > MAX) {
    const evicted = order.shift();
    if (evicted !== undefined) seen.delete(evicted);
  }
  return false;
}
