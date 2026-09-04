"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { STAGE_LABELS, type Stage } from "@/lib/listing";

type Marker = {
  id: string;
  lat: number;
  lng: number;
  precision: "exact" | "approx";
  price_eur: number | null;
  title: string;
  rooms: number | null;
  area_m2: number | null;
  stage: Stage;
  cover: string | null;
};

const BARCELONA: [number, number] = [41.3874, 2.1686];
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function popup(m: Marker) {
  const price = m.price_eur == null ? "Sin precio" : `€ ${m.price_eur.toLocaleString("es-ES")}`;
  const facts = [m.rooms != null && `${m.rooms} hab.`, m.area_m2 != null && `${m.area_m2} m²`]
    .filter(Boolean)
    .join(" · ");
  const href = `/propiedades/${encodeURIComponent(m.id)}`;
  return `<div style="min-width:180px">
    ${m.cover ? `<img src="${esc(m.cover)}" alt="" onerror="this.remove()" style="width:100%;height:110px;object-fit:cover;border-radius:4px;margin-bottom:6px">` : ""}
    <a href="${href}" style="font-weight:600">${esc(m.title)}</a>
    <div style="margin-top:4px">${price}</div>
    ${facts ? `<div>${facts}</div>` : ""}
    <div style="color:#71717a;margin-top:4px">${STAGE_LABELS[m.stage] ?? esc(m.stage)}</div>
  </div>`;
}

/** Plain Leaflet mounted in an effect. `query` is the `etapa`/`todas` part of the URL. */
export default function Mapa({ query }: { query: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: LeafletMap | undefined;
    let cancelled = false;
    (async () => {
      // ponytail: no react-leaflet; leaflet reads `window` on import, so it loads here, not at the top
      const L = await import("leaflet");
      const markers: Marker[] = await (
        await fetch("/api/markers" + (query ? "?" + query : ""))
      ).json();
      if (cancelled || !ref.current) return;
      map = L.map(ref.current);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      const group = L.featureGroup(
        markers.map((m) =>
          L.circleMarker([m.lat, m.lng], {
            radius: 9,
            weight: 3,
            color: "#dc2626",
            fillColor: "#dc2626",
            fillOpacity: m.precision === "exact" ? 0.9 : 0,
          }).bindPopup(popup(m)),
        ),
      ).addTo(map);
      if (markers.length) map.fitBounds(group.getBounds().pad(0.15), { maxZoom: 16 });
      else map.setView(BARCELONA, 12);
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [query]);

  // 56 px left free for the bottom nav (#16)
  return <div ref={ref} className="h-[calc(100dvh-56px)] w-full" />;
}
