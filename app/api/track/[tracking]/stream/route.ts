import {
  getTrackingSnapshot,
  isTerminalTracking,
  type TrackSnapshot,
} from "@/lib/track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Realtime shipment tracking over Server-Sent Events. The server re-reads the
// snapshot every few seconds and pushes an `update` only when it changes, so the
// buyer's map moves within seconds of a courier ping — no client polling. The
// stream sends a comment heartbeat to survive proxies and closes itself once the
// parcel reaches a terminal state (or the client disconnects).
//
// Events:
//   update  → { status, driver, dest }   (the current snapshot; driver is null
//                                          unless the parcel is out for delivery)
//   end     → { status }                 (terminal: no more updates will come)

const POLL_MS = 5_000;
const HEARTBEAT_MS = 15_000;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tracking: string }> },
) {
  const { tracking } = await params;
  const decoded = decodeURIComponent(tracking);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let poll: ReturnType<typeof setInterval> | null = null;
      let beat: ReturnType<typeof setInterval> | null = null;
      let lastKey = "";

      const enqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Controller already torn down — stop cleanly.
          close();
        }
      };
      const send = (event: string, data: unknown) =>
        enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      const close = () => {
        if (closed) return;
        closed = true;
        if (poll) clearInterval(poll);
        if (beat) clearInterval(beat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const tick = async () => {
        if (closed) return;
        let snap: TrackSnapshot;
        try {
          snap = await getTrackingSnapshot(decoded);
        } catch {
          return; // transient DB error — try again next tick
        }
        if (closed) return;
        const key = JSON.stringify(snap);
        if (key !== lastKey) {
          lastKey = key;
          send("update", snap);
        }
        if (isTerminalTracking(snap.status)) {
          send("end", { status: snap.status });
          close();
        }
      };

      // Push the first snapshot immediately, then poll + heartbeat.
      void tick();
      poll = setInterval(() => void tick(), POLL_MS);
      beat = setInterval(() => enqueue(": ping\n\n"), HEARTBEAT_MS);
      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
