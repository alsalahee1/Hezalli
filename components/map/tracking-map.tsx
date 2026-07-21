"use client";

import { useEffect, useRef, useState } from "react";
import type * as L from "leaflet";
import { useTranslations } from "next-intl";
import "leaflet/dist/leaflet.css";

// Live courier position on the public tracking page. Primary transport is the
// SSE stream at /api/track/[tracking]/stream — the driver marker moves within
// seconds of a courier ping, no client polling. Falls back to polling the JSON
// endpoint if the browser has no EventSource or the stream errors. Renders
// nothing until the server reports a driver point (parcel out for delivery and
// the courier sharing location). Leaflet is imported lazily to dodge SSR.

type Snapshot = {
  driver: { lat: number; lng: number; updatedAt: string } | null;
  dest: { lat: number; lng: number } | null;
};

const pin = (color: string) =>
  '<div style="transform:translate(-50%,-100%)"><svg width="26" height="36" viewBox="0 0 24 34" xmlns="http://www.w3.org/2000/svg">' +
  `<path d="M12 0C5.4 0 0 5.4 0 12c0 8.4 12 22 12 22s12-13.6 12-22C24 5.4 18.6 0 12 0z" fill="${color}"/>` +
  '<circle cx="12" cy="12" r="5" fill="#fff"/></svg></div>';

export function TrackingMap({ tracking }: { tracking: string }) {
  const t = useTranslations("Tracking");
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const leafletRef = useRef<typeof L | null>(null);
  const [ready, setReady] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    async function ensureMap(leaflet: typeof L, center: [number, number]) {
      if (mapRef.current || !elRef.current) return;
      const map = leaflet.map(elRef.current).setView(center, 13);
      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap",
          maxZoom: 19,
        })
        .addTo(map);
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 0);
    }

    // Apply one snapshot to the map (create/move the driver marker, draw the
    // destination once, keep both in view).
    async function render(data: Snapshot) {
      if (disposed || !data.driver) return;
      const leaflet = leafletRef.current ?? (await import("leaflet"));
      leafletRef.current = leaflet;
      if (disposed) return;

      setReady(true);
      setUpdatedAt(data.driver.updatedAt);
      await ensureMap(leaflet, [data.driver.lat, data.driver.lng]);
      const map = mapRef.current!;

      if (!driverMarkerRef.current) {
        driverMarkerRef.current = leaflet
          .marker([data.driver.lat, data.driver.lng], {
            icon: leaflet.divIcon({
              html: pin("#0f9c98"),
              className: "",
              iconSize: [26, 36],
            }),
          })
          .addTo(map);
      } else {
        driverMarkerRef.current.setLatLng([data.driver.lat, data.driver.lng]);
      }

      if (data.dest && !destMarkerRef.current) {
        destMarkerRef.current = leaflet
          .marker([data.dest.lat, data.dest.lng], {
            icon: leaflet.divIcon({
              html: pin("#c98a1f"),
              className: "",
              iconSize: [26, 36],
            }),
          })
          .addTo(map);
        map.fitBounds(
          leaflet.latLngBounds(
            [data.driver.lat, data.driver.lng],
            [data.dest.lat, data.dest.lng],
          ),
          { padding: [40, 40], maxZoom: 15 },
        );
      } else if (!data.dest) {
        map.setView([data.driver.lat, data.driver.lng]);
      }
    }

    // --- Polling fallback (no EventSource, or the stream errored) ---
    let timer: ReturnType<typeof setInterval> | null = null;
    async function pollOnce() {
      try {
        const res = await fetch(
          `/api/track/${encodeURIComponent(tracking)}/location`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        await render((await res.json()) as Snapshot);
      } catch {
        /* transient network error — try again next tick */
      }
    }
    function startPolling() {
      if (disposed || timer) return;
      void pollOnce();
      timer = setInterval(pollOnce, 20_000);
    }

    // --- Primary: SSE stream ---
    let es: EventSource | null = null;
    if (typeof EventSource !== "undefined") {
      es = new EventSource(`/api/track/${encodeURIComponent(tracking)}/stream`);
      es.addEventListener("update", (ev) => {
        try {
          void render(JSON.parse((ev as MessageEvent).data) as Snapshot);
        } catch {
          /* ignore a malformed frame */
        }
      });
      es.addEventListener("end", () => es?.close());
      es.onerror = () => {
        // A terminal stream closes on the server; the browser then retries. If
        // the connection is truly failing, fall back to polling instead.
        if (es && es.readyState === EventSource.CLOSED) {
          es = null;
          startPolling();
        }
      };
    } else {
      startPolling();
    }

    return () => {
      disposed = true;
      es?.close();
      if (timer) clearInterval(timer);
      mapRef.current?.remove();
      mapRef.current = null;
      driverMarkerRef.current = null;
      destMarkerRef.current = null;
    };
  }, [tracking]);

  // Nothing to show until the courier is actually broadcasting a position.
  if (!ready) return null;

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t("liveTitle")}</h2>
        {updatedAt ? (
          <span className="text-muted-foreground text-xs">
            {t("liveUpdated")}
          </span>
        ) : null}
      </div>
      <div
        ref={elRef}
        className="h-64 w-full overflow-hidden rounded-xl border"
        role="application"
        aria-label={t("liveTitle")}
      />
    </div>
  );
}
