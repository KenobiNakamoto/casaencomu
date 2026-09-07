"use client";

import { useEffect, useRef } from "react";
import type { ExpressionSpecification, Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
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

const BARCELONA: [number, number] = [2.1686, 41.3874]; // [lng, lat]
// ponytail: OpenFreeMap is keyless vector tiles; CARTO now watermarks, OSM raster is busy and blurs on Retina.
// maplibre-gl stays on 5.x: 6.x loads its worker as a separate ES module whose relative import of
// maplibre-gl-shared.mjs 404s once Turbopack copies both files under hashed names.
const STYLE = "https://tiles.openfreemap.org/styles/positron";
// Airbnb's palette on top of Positron: one warm ground, blue water, green parks. Unknown layer ids are skipped.
const PAINT: Record<string, Record<string, string>> = {
  background: { "background-color": "#f6f5f2" },
  landuse_residential: { "fill-color": "#f6f5f2" },
  building: { "fill-color": "#edece8" },
  water: { "fill-color": "#bfdff5" },
  waterway: { "line-color": "#bfdff5" },
  park: { "fill-color": "#d5ecd2" },
  landcover_wood: { "fill-color": "#dcebd8" },
};
// Positron labels prefer `name_en` ("OLD TOWN"); the family reads the local names.
const LOCAL_NAME: ExpressionSpecification = ["coalesce", ["get", "name:latin"], ["get", "name"]];
const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** 32-point ring of `r` metres around a point; equirectangular is exact enough at 180 m. */
const ring = (lng: number, lat: number, r: number) =>
  Array.from({ length: 33 }, (_, i) => {
    const a = (i / 32) * 2 * Math.PI;
    return [lng + (r * Math.cos(a)) / (111320 * Math.cos((lat * Math.PI) / 180)), lat + (r * Math.sin(a)) / 111320];
  });

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
 * Plain MapLibre mounted in an effect. Price pills are the markers; hovering any element with
 * `data-property=<id>` on the page (the list cards) highlights that pill.
 */
export default function Mapa({ markers, embedded = false }: { markers: MapMarker[]; embedded?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: MLMap | undefined;
    let cancelled = false;
    let detach = () => {};
    (async () => {
      // ponytail: no react wrapper; maplibre reads `window` on import, so it loads here, not at the top
      const ml = await import("maplibre-gl");
      if (cancelled || !ref.current) return;
      map = new ml.Map({
        container: ref.current,
        center: BARCELONA,
        zoom: 12,
        minZoom: 9,
        maxZoom: 18,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
      map.setStyle(STYLE, {
        transformStyle: (_, s) => {
          for (const l of s.layers) {
            if (PAINT[l.id]) Object.assign((l.paint ??= {}), PAINT[l.id]);
            if (l.type === "symbol" && l.layout && JSON.stringify(l.layout["text-field"] ?? "").includes("name"))
              l.layout["text-field"] = LOCAL_NAME;
          }
          return s;
        },
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new ml.NavigationControl({ showCompass: false }), "bottom-right");
      map.addControl(new ml.AttributionControl({ compact: true }), "bottom-left");

      const byId = new Map<string, HTMLElement>();
      const bounds = new ml.LngLatBounds();
      for (const m of markers) {
        const el = document.createElement("div");
        el.className = "pin-wrap";
        const price = m.price_eur == null ? "Sin precio" : esc(eur.format(m.price_eur));
        el.innerHTML = `<div class="pin">${m.precision === "approx" ? "≈ " : ""}${price}</div>`;
        const popup = new ml.Popup({ className: "mini", maxWidth: "260px", offset: 22, focusAfterOpen: false }).setHTML(card(m));
        new ml.Marker({ element: el }).setLngLat([m.lng, m.lat]).setPopup(popup).addTo(map);
        byId.set(m.id, el);
        bounds.extend([m.lng, m.lat]);
      }
      if (markers.length) map.fitBounds(bounds, { padding: { top: 72, bottom: 72, left: 90, right: 90 }, maxZoom: 15, duration: 0 });

      // Approximate addresses get a 180 m halo, drawn under the labels.
      const approx = markers.filter((m) => m.precision === "approx");
      if (approx.length)
        map.on("load", () => {
          if (!map) return;
          const features = approx.map((m) => ({
            type: "Feature" as const,
            properties: {},
            geometry: { type: "Polygon" as const, coordinates: [ring(m.lng, m.lat, 180)] },
          }));
          map.addSource("approx", { type: "geojson", data: { type: "FeatureCollection", features } });
          const before = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
          map.addLayer({ id: "approx-fill", type: "fill", source: "approx", paint: { "fill-color": "#ff385c", "fill-opacity": 0.08 } }, before);
          map.addLayer({ id: "approx-line", type: "line", source: "approx", paint: { "line-color": "#ff385c", "line-width": 1.5, "line-opacity": 0.6 } }, before);
        });

      // Hover sync with the list: the card's data-property → its pill.
      let active: HTMLElement | undefined;
      const set = (el: HTMLElement | undefined, on: boolean) => {
        el?.querySelector(".pin")?.classList.toggle("is-active", on);
        if (el) el.style.zIndex = on ? "1" : "";
      };
      const over = (e: Event) => {
        const id = (e.target as Element).closest?.("[data-property]")?.getAttribute("data-property");
        const el = id ? byId.get(id) : undefined;
        if (el === active) return;
        set(active, false);
        active = el;
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
