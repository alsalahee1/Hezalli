// In-memory guard against Telegram redelivering the same update. Telegram
// resends an update (same update_id) if we ACK slowly or a delivery times out;
// reprocessing would run the customer's turn twice. This is a best-effort
// backstop within a single server instance — the fast-ACK in the webhook is
// the primary defense.
import "server-only";

const seen = new Set<number>();
const order: number[] = [];
const MAX = 2000;

/** Returns true if this update_id was already handled (and records it). */
export function seenTelegramUpdate(updateId: number): boolean {
  if (seen.has(updateId)) return true;
  seen.add(updateId);
  order.push(updateId);
  if (order.length > MAX) {
    const evicted = order.shift();
    if (evicted !== undefined) seen.delete(evicted);
  }
  return false;
}
