"use client";

import { useEffect, useRef } from "react";
import type * as L from "leaflet";
import "leaflet/dist/leaflet.css";

// A small draggable-pin map for choosing a precise delivery location. Leaflet is
// imported dynamically inside the effect so it never runs during SSR (it touches
// `window` at module load). Uses a divIcon so we don't depend on Leaflet's
// default marker image assets (which break under bundlers).
const YEMEN_CENTER: [number, number] = [15.3694, 44.191]; // Sana'a

const PIN_ICON_HTML =
  '<div style="transform:translate(-50%,-100%)">' +
  '<svg width="30" height="42" viewBox="0 0 24 34" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M12 0C5.4 0 0 5.4 0 12c0 8.4 12 22 12 22s12-13.6 12-22C24 5.4 18.6 0 12 0z" fill="#0f9c98"/>' +
  '<circle cx="12" cy="12" r="5" fill="#fff"/></svg></div>';

export function MapPicker({
  value,
  onChange,
}: {
  value: { lat: number; lng: number } | null;
  onChange: (lat: number, lng: number) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  // Keep the latest onChange without re-running the init effect.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let disposed = false;
    (async () => {
      const leaflet = await import("leaflet");
      if (disposed || !elRef.current || mapRef.current) return;

      const icon = leaflet.divIcon({
        html: PIN_ICON_HTML,
        className: "",
        iconSize: [30, 42],
      });
      const start = value ?? { lat: YEMEN_CENTER[0], lng: YEMEN_CENTER[1] };
      const map = leaflet
        .map(elRef.current)
        .setView([start.lat, start.lng], value ? 15 : 7);
      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap",
          maxZoom: 19,
        })
        .addTo(map);

      const marker = leaflet
        .marker([start.lat, start.lng], { draggable: true, icon })
        .addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        onChangeRef.current(p.lat, p.lng);
      });
      // Tapping the map moves the pin too.
      map.on("click", (e: L.LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        onChangeRef.current(e.latlng.lat, e.latlng.lng);
      });

      mapRef.current = map;
      markerRef.current = marker;
      // The container is often revealed after mount; recompute its size.
      setTimeout(() => map.invalidateSize(), 0);
    })();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect external changes (e.g. the "pin my location" button) onto the map.
  useEffect(() => {
    if (value && markerRef.current && mapRef.current) {
      markerRef.current.setLatLng([value.lat, value.lng]);
      mapRef.current.setView([value.lat, value.lng], 15);
    }
    // Track the primitive coords, not the object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.lat, value?.lng]);

  return (
    <div
      ref={elRef}
      className="mt-3 h-56 w-full overflow-hidden rounded-md border"
      role="application"
      aria-label="Delivery location map"
    />
  );
}
