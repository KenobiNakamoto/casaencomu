"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { ExpressionSpecification, Map as MLMap, SymbolLayerSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { areaCoords, countByArea, type AreaLevel, type Areas } from "@/lib/geo";
import { STAGE_LABELS, type Stage } from "@/lib/listing";
import { useTheme } from "../use-theme";

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
/** One read of the live theme tokens; see DESIGN.md. Called after `data-theme` is on <html>. */
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Our palette on top of Positron, per theme. Unknown layer ids are skipped. */
const paint = (): Record<string, Record<string, string>> => ({
  background: { "background-color": css("--map-bg") },
  landuse_residential: { "fill-color": css("--map-bg") },
  building: { "fill-color": css("--map-building") },
  water: { "fill-color": css("--map-water") },
  waterway: { "line-color": css("--map-water") },
  park: { "fill-color": css("--map-park") },
  landcover_wood: { "fill-color": css("--map-wood") },
});

// Positron labels prefer `name_en` ("OLD TOWN"); the family reads the local names.
const LOCAL_NAME: ExpressionSpecification = ["coalesce", ["get", "name:latin"], ["get", "name"]];
/*
 * ponytail: a theme change rebuilds the map instead of re-styling it in place — it happens once
 * in a while, and the effect below already tears down cleanly.
 */

/** Districts while the whole city is in view, barris once you are looking at streets. */
const ZOOM_SPLIT = 13.5;
const LEVELS: { level: AreaLevel; minzoom: number; maxzoom: number; size: number; width: number }[] = [
  { level: "distrito", minzoom: 0, maxzoom: ZOOM_SPLIT, size: 13, width: 2 },
  { level: "barrio", minzoom: ZOOM_SPLIT, maxzoom: 24, size: 12, width: 1.2 },
];

// The boundaries are 129 KB and never change within a session, so fetch them once per page load.
let areasOnce: Promise<Areas> | undefined;
const getAreas = () => (areasOnce ??= fetch("/areas.geojson").then((r) => r.json() as Promise<Areas>));

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
  return `<a href="${href}" style="display:block;color:var(--ink);text-decoration:none">
    ${
      m.cover
        ? `<img src="${esc(m.cover)}" alt="" onerror="this.remove()" style="display:block;width:100%;aspect-ratio:4/3;object-fit:cover">`
        : `<div style="width:100%;aspect-ratio:4/3;background:var(--surface-strong)"></div>`
    }
    <div style="padding:12px 14px 14px">
      <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.title)}</div>
      <div style="color:var(--muted);font-size:13px;margin-top:2px">${meta || "Sin datos"}</div>
      <div style="margin-top:6px"><strong>${price}</strong> <span style="color:var(--muted);font-size:13px">· ${STAGE_LABELS[m.stage] ?? esc(m.stage)}</span></div>
    </div>
  </a>`;
}

/**
 * Plain MapLibre mounted in an effect. Price pills are the markers; hovering any element with
 * `data-property=<id>` on the page (the list cards) highlights that pill.
 */
export default function Mapa({
  markers,
  embedded = false,
  zona = "",
  params = {},
}: {
  markers: MapMarker[];
  embedded?: boolean;
  /** id of the area the list is filtered to, from `?zona=`. */
  zona?: string;
  /** the other live filters, so a click on an area keeps them. */
  params?: Record<string, string>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const theme = useTheme();

  useEffect(() => {
    // read once per build; `theme` in the deps is what makes a switch rebuild with new colours
    const PAINTS = paint();
    const accent = css("--accent");
    let map: MLMap | undefined;
    let cancelled = false;
    let detach = () => {};
    (async () => {
      // ponytail: no react wrapper; maplibre reads `window` on import, so it loads here, not at the top
      const [ml, areas] = await Promise.all([import("maplibre-gl"), getAreas()]);
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
            if (PAINTS[l.id]) Object.assign((l.paint ??= {}), PAINTS[l.id]);
            if (l.type === "symbol" && l.layout && JSON.stringify(l.layout["text-field"] ?? "").includes("name"))
              l.layout["text-field"] = LOCAL_NAME;
          }
          return s;
        },
      });
      const m = map;
      m.touchZoomRotate.disableRotation();
      m.addControl(new ml.NavigationControl({ showCompass: false }), "bottom-right");
      m.addControl(new ml.AttributionControl({ compact: true }), "bottom-left");

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
      const activeArea = areas.features.find((f) => f.properties.id === zona);
      if (activeArea) {
        const b = new ml.LngLatBounds();
        for (const c of areaCoords(activeArea)) b.extend(c);
        map.fitBounds(b, { padding: 40, duration: 0 });
      } else if (markers.length) {
        map.fitBounds(bounds, { padding: { top: 72, bottom: 72, left: 90, right: 90 }, maxZoom: 15, duration: 0 });
      }

      // Clicking an area filters the page to it; clicking it again clears the filter.
      const go = (id: string) => {
        const q = new URLSearchParams(params);
        if (id === zona) q.delete("zona");
        else q.set("zona", id);
        const query = q.toString();
        router.push(query ? `${pathname}?${query}` : pathname);
      };

      const approx = markers.filter((mk) => mk.precision === "approx");
      const counts = countByArea(areas.features, markers);
      const data: Areas = {
        ...areas,
        features: areas.features.map((f) => ({ ...f, properties: { ...f.properties, count: counts[f.properties.id] ?? 0 } })),
      };

      m.on("load", () => {
        const before = m.getStyle().layers.find((l) => l.type === "symbol")?.id;

        // Our area labels say what the basemap's suburb labels said, in the same places.
        if (m.getLayer("label_other")) m.setLayoutProperty("label_other", "visibility", "none");

        // Areas first, so the halos and the basemap's own labels stay above them.
        m.addSource("areas", { type: "geojson", data, promoteId: "id" });
        for (const { level, minzoom, maxzoom, width } of LEVELS) {
          const filter = ["==", ["get", "level"], level] as ExpressionSpecification;
          m.addLayer(
            {
              id: `areas-fill-${level}`,
              type: "fill",
              source: "areas",
              filter,
              minzoom,
              maxzoom,
              paint: {
                "fill-color": accent,
                // Outline only at rest: filling every area at once tints the whole city.
                "fill-opacity": [
                  "case",
                  ["boolean", ["feature-state", "hover"], false],
                  0.14,
                  ["==", ["get", "id"], zona],
                  0.12,
                  0,
                ],
              },
            },
            before,
          );
          m.addLayer(
            {
              id: `areas-line-${level}`,
              type: "line",
              source: "areas",
              filter,
              minzoom,
              maxzoom,
              paint: {
                "line-color": accent,
                "line-width": ["case", ["==", ["get", "id"], zona], width + 1, width] as ExpressionSpecification,
                "line-opacity": ["case", ["==", ["get", "id"], zona], 0.9, 0.4] as ExpressionSpecification,
              },
            },
            before,
          );
        }

        // Approximate addresses get a 180 m halo, drawn under the labels.
        if (approx.length) {
          const features = approx.map((mk) => ({
            type: "Feature" as const,
            properties: {},
            geometry: { type: "Polygon" as const, coordinates: [ring(mk.lng, mk.lat, 180)] },
          }));
          m.addSource("approx", { type: "geojson", data: { type: "FeatureCollection", features } });
          m.addLayer({ id: "approx-fill", type: "fill", source: "approx", paint: { "fill-color": accent, "fill-opacity": 0.08 } }, before);
          m.addLayer({ id: "approx-line", type: "line", source: "approx", paint: { "line-color": accent, "line-width": 1.5, "line-opacity": 0.6 } }, before);
        }

        // Area names on top of everything, with the count when the area holds anything.
        const font = m.getStyle().layers.find(
          (l): l is SymbolLayerSpecification => l.type === "symbol" && Array.isArray(l.layout?.["text-font"]),
        )?.layout?.["text-font"];
        if (font) {
          for (const { level, minzoom, maxzoom, size } of LEVELS) {
            m.addLayer({
              id: `areas-label-${level}`,
              type: "symbol",
              source: "areas",
              filter: ["==", ["get", "level"], level] as ExpressionSpecification,
              minzoom,
              maxzoom,
              layout: {
                "text-font": font,
                "text-field": [
                  "case",
                  [">", ["get", "count"], 0],
                  ["concat", ["get", "name"], "\n", ["to-string", ["get", "count"]]],
                  ["get", "name"],
                ],
                "text-size": size,
                "text-line-height": 1.2,
                "text-padding": 6,
              },
              paint: {
                "text-color": ["case", [">", ["get", "count"], 0], css("--map-label"), css("--muted-soft")],
                "text-halo-color": css("--map-halo"),
                "text-halo-width": 1.6,
              },
            });
          }
        }

        // Hover highlights the area under the cursor; a click filters to it.
        let hover: string | undefined;
        const clear = () => {
          if (hover) m.setFeatureState({ source: "areas", id: hover }, { hover: false });
          hover = undefined;
        };
        for (const { level } of LEVELS) {
          const layer = `areas-fill-${level}`;
          m.on("mousemove", layer, (e) => {
            const f = e.features?.[0];
            if (!f || String(f.id) === hover) return;
            clear();
            hover = String(f.id);
            m.setFeatureState({ source: "areas", id: hover }, { hover: true });
            m.getCanvas().style.cursor = "pointer";
          });
          m.on("mouseleave", layer, () => {
            clear();
            m.getCanvas().style.cursor = "";
          });
          m.on("click", layer, (e) => {
            const f = e.features?.[0];
            if (f) go(String(f.properties.id));
          });
        }
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
  }, [markers, embedded, zona, params, router, pathname, theme]);

  // Full page: top bar (64/80 px) and the phone bottom bar (56 px) are outside the map.
  return (
    <div
      ref={ref}
      className={embedded ? "h-full w-full" : "h-[calc(100dvh-var(--header-h)-var(--nav-bottom-h))] w-full"}
    />
  );
}
