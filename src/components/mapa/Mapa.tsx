"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { STAGE_LABELS, type Stage } from "@/lib/listing";

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  precision: "exact" | "approx";
  price_eur: number | null;
  title: string;
  rooms: number | null;
  area_m2: number | null;
  neighborhood: string | null;
  stage: Stage;
  cover: string | null;
};

const BARCELONA: [number, number] = [41.3874, 2.1686];
const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The popup is an Airbnb mini card: photo, title, meta, price. */
function card(m: MapMarker) {
  const price = m.price_eur == null ? "Sin precio" : eur.format(m.price_eur);
  const meta = [m.neighborhood, m.area_m2 != null && `${m.area_m2} m²`, m.rooms != null && `${m.rooms} hab.`]
    .filter(Boolean)
    .map((s) => esc(String(s)))
    .join(" · ");
  const href = `/propiedades/${encodeURIComponent(m.id)}`;
  return `<a href="${href}" style="display:block;color:#222;text-decoration:none">
    ${
      m.cover
        ? `<img src="${esc(m.cover)}" alt="" onerror="this.remove()" style="display:block;width:100%;aspect-ratio:4/3;object-fit:cover">`
        : `<div style="width:100%;aspect-ratio:4/3;background:#f2f2f2"></div>`
    }
    <div style="padding:12px 14px 14px">
      <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.title)}</div>
      <div style="color:#6a6a6a;font-size:13px;margin-top:2px">${meta || "Sin datos"}</div>
      <div style="margin-top:6px"><strong>${price}</strong> <span style="color:#6a6a6a;font-size:13px">· ${STAGE_LABELS[m.stage] ?? esc(m.stage)}</span></div>
    </div>
  </a>`;
}

/**
 * Plain Leaflet mounted in an effect. Price pills are the markers; hovering any element with
 * `data-property=<id>` on the page (the list cards) highlights that pill.
 */
export default function Mapa({ markers, embedded = false }: { markers: MapMarker[]; embedded?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: LeafletMap | undefined;
    let cancelled = false;
    let detach = () => {};
    (async () => {
      // ponytail: no react-leaflet; leaflet reads `window` on import, so it loads here, not at the top
      const L = await import("leaflet");
      if (cancelled || !ref.current) return;
      map = L.map(ref.current, { zoomControl: false });
      L.control.zoom({ position: "bottomright" }).addTo(map);
      // ponytail: OSM's keyless tiles, desaturated in CSS (.leaflet-tile-pane) for the calm Airbnb look; CARTO now wants an API key
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      const group = L.featureGroup().addTo(map);
      const byId = new Map<string, LeafletMarker>();
      for (const m of markers) {
        if (m.precision === "approx")
          L.circle([m.lat, m.lng], { radius: 180, color: "#ff385c", weight: 1, fillColor: "#ff385c", fillOpacity: 0.1, interactive: false }).addTo(group);
        const icon = L.divIcon({
          className: "pin-wrap",
          iconSize: [0, 0],
          html: `<div class="pin${m.precision === "approx" ? " is-approx" : ""}">${m.price_eur == null ? "Sin precio" : esc(eur.format(m.price_eur))}</div>`,
        });
        const mk = L.marker([m.lat, m.lng], { icon, riseOnHover: true })
          .bindPopup(card(m), { className: "mini", minWidth: 260, maxWidth: 260, offset: [0, -14], autoPanPadding: [24, 24] })
          .addTo(group);
        byId.set(m.id, mk);
      }
      // Bounds from the coordinates: a Circle's getBounds() needs a projected map and throws before the first render.
      if (markers.length) map.fitBounds(L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number])).pad(0.2), { maxZoom: 15 });
      else map.setView(BARCELONA, 12);

      // Hover sync with the list: the card's data-property → its pill.
      let active: LeafletMarker | undefined;
      const set = (mk: LeafletMarker | undefined, on: boolean) => {
        mk?.getElement()?.querySelector(".pin")?.classList.toggle("is-active", on);
        mk?.setZIndexOffset(on ? 1000 : 0);
      };
      const over = (e: Event) => {
        const id = (e.target as Element).closest?.("[data-property]")?.getAttribute("data-property");
        const mk = id ? byId.get(id) : undefined;
        if (mk === active) return;
        set(active, false);
        active = mk;
        set(active, true);
      };
      document.addEventListener("mouseover", over);
      detach = () => document.removeEventListener("mouseover", over);
    })();
    return () => {
      cancelled = true;
      detach();
      map?.remove();
    };
  }, [markers, embedded]);

  // Full page: top bar (64/80 px) and the phone bottom bar (56 px) are outside the map.
  return (
    <div
      ref={ref}
      className={embedded ? "h-full w-full" : "h-[calc(100dvh-64px-56px)] w-full md:h-[calc(100dvh-80px)]"}
    />
  );
}
