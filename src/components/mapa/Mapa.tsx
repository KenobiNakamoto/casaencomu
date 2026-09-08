"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ExpressionSpecification,
  Map as MLMap,
  Marker as MLMarker,
  Popup as MLPopup,
  StyleSpecification,
  SymbolLayerSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { detailHrefFrom } from "@/lib/filters";
import { areaCoords, countByArea, type AreaLevel, type Areas } from "@/lib/geo";
import { STAGE_LABELS, type Stage } from "@/lib/listing";
import { groupByCoord, groupLabel, pinLabel, pinText, price, type PinGroup } from "@/lib/map-pins";
import { buildStyle, MAP_TOKENS, repaint, type MapTokens } from "@/lib/map-style";
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

/** One read of the live theme tokens. Called after `data-theme` is on <html>. */
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const readTokens = (): MapTokens =>
  Object.fromEntries(MAP_TOKENS.map((t) => [t, css(t)])) as MapTokens;

/** Districts while the whole city is in view, barris once you are looking at streets. */
const ZOOM_SPLIT = 13.5;
const LEVELS: { level: AreaLevel; minzoom: number; maxzoom: number; size: number; bump: number }[] = [
  // § 6: widths go up half a pixel at district zoom, where the outlines are further apart.
  { level: "distrito", minzoom: 0, maxzoom: ZOOM_SPLIT, size: 13, bump: 0.5 },
  { level: "barrio", minzoom: ZOOM_SPLIT, maxzoom: 24, size: 12, bump: 0 },
];

// The boundaries are 129 KB and never change within a session, so fetch them once per page load.
let areasOnce: Promise<Areas> | undefined;
const getAreas = () => (areasOnce ??= fetch("/areas.geojson").then((r) => r.json() as Promise<Areas>));

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const hovered: ExpressionSpecification = ["boolean", ["feature-state", "hover"], false];
const selected = (zona: string): ExpressionSpecification => ["==", ["get", "id"], zona];

/**
 * F11: an area outline is a *selection highlight*, not an error, so it rests on the neutral
 * boundary token and only reaches for `--secondary` when you hover or select it. Red stays
 * reserved for the one primary action in the preview.
 *
 * The resting state used to be a hairline at 0.35 over no fill at all, so a neighbourhood only
 * existed while the cursor was on it and the map read as having no districts (Kenobi, 2026-09-08).
 * It now rests on a visible line and a neutral wash. Hover and selection keep the yellow, so what
 * you point at still separates itself from what you do not.
 */
function areaPaint(zona: string, bump: number) {
  const edge = css("--map-label");
  const mark = css("--secondary");
  // Night needs a touch more of everything to read at the same strength (§ 6).
  const night = document.documentElement.dataset.theme === "dark";
  const rest = night ? 0.06 : 0.045;
  const hover = night ? 0.18 : 0.14;
  const pick = night ? 0.24 : 0.2;
  return {
    line: {
      // Dashed, always. The basemap's own streets are solid lines of about this width in about
      // this grey, so a solid boundary was read as one more street and the districts disappeared
      // into the road network. A dash cannot be mistaken for a street at any zoom.
      "line-dasharray": [3, 2.5],
      "line-color": ["case", hovered, mark, selected(zona), mark, edge] as ExpressionSpecification,
      "line-width": ["case", selected(zona), 2.6 + bump, hovered, 2.2 + bump, 1.6 + bump] as ExpressionSpecification,
      "line-opacity": ["case", selected(zona), 1, hovered, 0.95, 0.75] as ExpressionSpecification,
    },
    fill: {
      // Neutral at rest so the whole city is not tinted with the selection colour; the wash turns
      // yellow only for the one area you are pointing at or have chosen.
      "fill-color": ["case", hovered, mark, selected(zona), mark, edge] as ExpressionSpecification,
      "fill-opacity": ["case", selected(zona), pick, hovered, hover, rest] as ExpressionSpecification,
    },
    label: {
      "text-color": ["case", [">", ["get", "count"], 0], css("--map-label"), css("--map-label-secondary")] as ExpressionSpecification,
      "text-halo-color": css("--map-halo"),
      "text-halo-width": 1.5,
    },
  };
}

/** § 6: the circle is illustrative. It is not a portal-provided error bound. */
function approxPaint() {
  return {
    line: { "line-color": css("--map-label-secondary"), "line-width": 1, "line-opacity": 0.65, "line-dasharray": [4, 3] },
    fill: { "fill-color": css("--map-label-secondary"), "fill-opacity": 0.05 },
  };
}

/** 32-point ring of `r` metres around a point; equirectangular is exact enough at 180 m. */
const ring = (lng: number, lat: number, r: number) =>
  Array.from({ length: 33 }, (_, i) => {
    const a = (i / 32) * 2 * Math.PI;
    return [lng + (r * Math.cos(a)) / (111320 * Math.cos((lat * Math.PI) / 180)), lat + (r * Math.sin(a)) / 111320];
  });

const circleFor = (m: MapMarker | undefined) => ({
  type: "FeatureCollection" as const,
  features:
    m && m.precision === "approx"
      ? [{ type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [ring(m.lng, m.lat, 180)] } }]
      : [],
});

/** The popup is an Airbnb mini card: photo, title, meta, price. */
function card(m: MapMarker, desde: string) {
  const meta = [m.neighborhood, m.area_m2 != null && `${m.area_m2} m²`, m.rooms != null && `${m.rooms} hab.`]
    .filter(Boolean)
    .map((s) => esc(String(s)))
    .join(" · ");
  const href = detailHrefFrom(m.id, desde);
  return `<a href="${href}" style="display:block;color:var(--ink);text-decoration:none">
    ${
      m.cover
        ? `<img src="${esc(m.cover)}" alt="" onerror="this.remove()" style="display:block;width:100%;aspect-ratio:4/3;object-fit:cover">`
        : `<div style="width:100%;aspect-ratio:4/3;background:var(--surface-strong)"></div>`
    }
    <div style="padding:12px 14px 14px">
      <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.title)}</div>
      <div style="color:var(--muted);font-size:13px;margin-top:2px">${meta || "Sin datos"}</div>
      <div style="margin-top:6px"><strong>${esc(price(m.price_eur))}</strong> <span style="color:var(--muted);font-size:13px">· ${STAGE_LABELS[m.stage] ?? esc(m.stage)}</span></div>
    </div>
  </a>`;
}

/** Several homes on one portal centroid: name them all instead of hiding all but the top one. */
function chooser(items: MapMarker[], desde: string) {
  const rows = items
    .map(
      (m) => `<a href="${detailHrefFrom(m.id, desde)}" class="chooser-row">
        <span class="chooser-price">${esc(price(m.price_eur))}</span>
        <span class="chooser-title">${esc(m.title)}</span>
        <span class="chooser-where">${m.precision === "approx" ? "Ubicación aproximada" : "Ubicación exacta"}</span>
      </a>`,
    )
    .join("");
  return `<div class="chooser"><p class="chooser-head">${items.length} viviendas en este punto</p>${rows}</div>`;
}

/**
 * Plain MapLibre mounted in an effect, with one responsibility per effect (§ 8): the map is
 * built once and never rebuilt. A theme change re-paints it, new results move the markers, and
 * an area selection moves the camera. Nothing else touches the camera.
 *
 * Hovering or focusing any element with `data-property=<id>` inside the enclosing
 * `[data-results]` highlights that pin.
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
  const [failed, setFailed] = useState(false);

  const map = useRef<MLMap>(undefined);
  const ready = useRef(false);
  const pins = useRef(new Map<string, { marker: MLMarker; el: HTMLButtonElement; popup: MLPopup; label: string }>());
  const activeId = useRef<string>(undefined);

  /**
   * Everything a long-lived handler needs, refreshed on every render. Closing over the props
   * instead would put them in a dependency list, and that is what rebuilt the map (F10).
   */
  const now = useRef({ markers, zona, params, pathname, router });
  // Declared first, and with no dependency list, so it runs before every effect below.
  useEffect(() => {
    now.current = { markers, zona, params, pathname, router };
  });

  // ---------------------------------------------------------------------------------------
  const set = useCallback((m: MLMap, layer: string, props: Record<string, unknown>) => {
    if (!m.getLayer(layer)) return;
    for (const [k, v] of Object.entries(props)) m.setPaintProperty(layer, k, v as never);
  }, []);

  const announce = useCallback((text: string) => {
    const live = ref.current?.querySelector("[data-live]");
    if (live) live.textContent = text;
  }, []);

  /** Marks one pin as the active one, and draws the uncertainty circle only for that one. */
  const highlight = useCallback((id: string | undefined) => {
    if (id === activeId.current) return;
    activeId.current = id;
    for (const [, pin] of pins.current) pin.el.classList.remove("is-active");
    const m = map.current;
    const marker = now.current.markers.find((k) => k.id === id);
    if (marker) pins.current.get(`${marker.lng},${marker.lat}`)?.el.classList.add("is-active");
    (m?.getSource("approx") as { setData?: (d: unknown) => void } | undefined)?.setData?.(circleFor(marker));
  }, []);

  const addOverlays = useCallback((m: MLMap, ml: typeof import("maplibre-gl"), areas: Areas) => {
    const before = m.getStyle().layers.find((l) => l.type === "symbol")?.id;
    m.addSource("areas", { type: "geojson", data: areas, promoteId: "id" });
    m.addSource("approx", { type: "geojson", data: circleFor(undefined) });

    // Areas first, so the halos and the basemap's own labels stay above them.
    for (const { level, minzoom, maxzoom, bump } of LEVELS) {
      const filter = ["==", ["get", "level"], level] as ExpressionSpecification;
      const p = areaPaint(now.current.zona, bump);
      m.addLayer({ id: `areas-fill-${level}`, type: "fill", source: "areas", filter, minzoom, maxzoom, paint: p.fill }, before);
      m.addLayer({ id: `areas-line-${level}`, type: "line", source: "areas", filter, minzoom, maxzoom, paint: p.line }, before);
    }

    const a = approxPaint();
    m.addLayer({ id: "approx-fill", type: "fill", source: "approx", paint: a.fill }, before);
    m.addLayer({ id: "approx-line", type: "line", source: "approx", paint: a.line }, before);

    // Area names on top of everything, with the count when the area holds anything.
    const font = m.getStyle().layers.find(
      (l): l is SymbolLayerSpecification => l.type === "symbol" && Array.isArray(l.layout?.["text-font"]),
    )?.layout?.["text-font"];
    if (font) {
      for (const { level, minzoom, maxzoom, size, bump } of LEVELS) {
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
          paint: areaPaint(now.current.zona, bump).label,
        });
      }
    }

    // Hover highlights the area under the cursor; a click filters to it.
    // Clicking the map away from a pin closes the preview, the same as Escape.
    m.on("click", (e) => {
      if ((e.originalEvent.target as Element | null)?.closest?.(".maplibregl-marker")) return;
      for (const pin of pins.current.values()) pin.popup.remove();
    });

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
      // Reads `now.current`, so it can never act on a filter set that has moved on.
      m.on("click", layer, (e) => {
        // A click on a pin is a click on the pin, not on the area underneath it. This also
        // catches a keyboard-driven click, whose coordinates are the corner of the viewport.
        if ((e.originalEvent?.target as Element | null)?.closest?.(".maplibregl-marker")) return;
        const f = e.features?.[0];
        if (!f) return;
        const id = String(f.properties.id);
        const q = new URLSearchParams(now.current.params);
        if (id === now.current.zona) q.delete("zona");
        else q.set("zona", id);
        const query = q.toString();
        now.current.router.push(query ? `${now.current.pathname}?${query}` : now.current.pathname);
      });
    }
    void ml;
  }, []);

  /** The area counts follow the results; the geometry never changes. */
  const syncAreas = useCallback((m: MLMap, areas: Areas) => {
    const counts = countByArea(areas.features, now.current.markers);
    const source = m.getSource("areas") as { setData?: (d: unknown) => void } | undefined;
    source?.setData?.({
      ...areas,
      features: areas.features.map((f) => ({ ...f, properties: { ...f.properties, count: counts[f.properties.id] ?? 0 } })),
    });
  }, []);

  /**
   * MapLibre's own `Marker.setPopup` toggles on a *map* click, and a map click is only emitted
   * when the pointer has not moved since mousedown. A button pressed with Enter reports (0, 0)
   * and no mousedown at all, so that path silently drops every keyboard activation. Owning the
   * popup gives the mouse and the keyboard one code path (F12).
   */
  const open = useCallback(
    (m: MLMap, key: string) => {
      for (const [k, pin] of pins.current) if (k !== key) pin.popup.remove();
      const pin = pins.current.get(key);
      if (!pin) return;
      const [lng, lat] = key.split(",").map(Number);
      pin.popup.setLngLat([lng, lat]).addTo(m);
    },
    [],
  );

  /** Adds, updates and removes only the pins that changed. */
  const syncPins = useCallback((m: MLMap, ml: typeof import("maplibre-gl")) => {
    const groups = groupByCoord(now.current.markers);
    const wanted = new Set(groups.map((g) => g.key));
    for (const [key, pin] of pins.current) {
      if (wanted.has(key)) continue;
      pin.marker.remove();
      pins.current.delete(key);
    }
    for (const group of groups) {
      const label = pinLabelFor(group);
      const existing = pins.current.get(group.key);
      if (existing) {
        if (existing.label === label) continue;
        existing.el.textContent = pinTextFor(group);
        existing.el.setAttribute("aria-label", label);
        existing.popup.setHTML(popupFor(group, now.current.params));
        existing.label = label;
        continue;
      }
      const el = document.createElement("button");
      el.type = "button";
      // A real button, so Enter and Space open the preview and Tab reaches it (F12).
      el.className = group.items.length > 1 ? "pin pin-group" : "pin";
      el.textContent = pinTextFor(group);
      el.setAttribute("aria-label", label);
      const popup = new ml.Popup({
        className: "mini",
        maxWidth: "300px",
        offset: 22,
        focusAfterOpen: false,
        // We open and close it ourselves; see `open` below.
        closeOnClick: false,
      }).setHTML(popupFor(group, now.current.params));
      const key = group.key;
      const pick = () => (group.items.length === 1 ? group.items[0].id : undefined);
      // MapLibre calls preventDefault on a marker's mousedown to keep it from starting a drag,
      // which also stops the click from focusing the button. So selection is set here, not only
      // on focus — otherwise a clicked pin would open its preview without being the selected one.
      el.addEventListener("click", () => {
        open(m, key);
        highlight(pick());
      });
      el.addEventListener("focus", () => highlight(pick()));
      const marker = new ml.Marker({ element: el }).setLngLat([group.lng, group.lat]).addTo(m);
      pins.current.set(group.key, { marker, el, popup, label });
    }
  }, [highlight, open]);

  const backToAll = useCallback((m: MLMap, ml: typeof import("maplibre-gl"), duration = 500) => {
    const list = now.current.markers;
    if (!list.length) return;
    const b = new ml.LngLatBounds();
    for (const k of list) b.extend([k.lng, k.lat]);
    m.fitBounds(b, { padding: { top: 72, bottom: 72, left: 90, right: 90 }, maxZoom: 15, duration });
  }, []);

  const fit = useCallback((m: MLMap, ml: typeof import("maplibre-gl"), areas: Areas, target: string, initial: boolean) => {
    const area = areas.features.find((f) => f.properties.id === target);
    if (area) {
      const b = new ml.LngLatBounds();
      for (const c of areaCoords(area)) b.extend(c);
      m.fitBounds(b, { padding: 40, duration: initial ? 0 : 500 });
      return;
    }
    // Only the first paint, and clearing the area filter, frame the results. A new result set
    // on its own leaves the camera where the family put it (§ 8.4).
    if (!initial && !target) return void backToAll(m, ml);
    if (initial && now.current.markers.length) backToAll(m, ml, 0);
  }, [backToAll]);

  // ---- 1. mount: one map per mounted surface, destroyed only when the surface unmounts ------
  useEffect(() => {
    let cancelled = false;
    let stop = () => {};

    (async () => {
      // ponytail: no react wrapper; maplibre reads `window` on import, so it loads here, not at the top
      const [ml, areas] = await Promise.all([import("maplibre-gl"), getAreas()]).catch(() => [null, null] as const);
      if (cancelled || !ref.current || !ml || !areas) {
        if (!cancelled) setFailed(true);
        return;
      }

      let m: MLMap;
      try {
        m = new ml.Map({
          container: ref.current,
          // The style is a local object, so there is no style request that can fail — only the
          // tiles it points at, and a missing tile still leaves a usable map.
          // The one cast: our loose layer type against maplibre's exhaustive union.
          style: buildStyle(readTokens()) as unknown as StyleSpecification,
          center: BARCELONA,
          zoom: 12,
          minZoom: 9,
          maxZoom: 18,
          attributionControl: false,
          // The controls speak Spanish, like the rest of the app.
          locale: {
            "NavigationControl.ZoomIn": "Acercar",
            "NavigationControl.ZoomOut": "Alejar",
            "AttributionControl.ToggleAttribution": "Ver los créditos del mapa",
            "Marker.Title": "Vivienda",
            "Popup.Close": "Cerrar",
          },
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
        });
      } catch {
        setFailed(true); // no WebGL
        return;
      }
      map.current = m;
      m.touchZoomRotate.disableRotation();
      m.addControl(
        new ml.NavigationControl({ showCompass: false, visualizePitch: false }),
        "bottom-right",
      );
      m.addControl(new ml.AttributionControl({ compact: true }), "bottom-left");
      // Full extent (§ 8.5): the one control besides an area click that may move the camera.
      m.addControl(
        {
          onAdd: () => {
            const box = document.createElement("div");
            box.className = "maplibregl-ctrl maplibregl-ctrl-group";
            const button = document.createElement("button");
            button.type = "button";
            button.className = "ctrl-all";
            button.title = "Ver todas las viviendas";
            button.setAttribute("aria-label", "Ver todas las viviendas");
            button.textContent = "⤢";
            button.addEventListener("click", () => backToAll(m, ml));
            box.appendChild(button);
            return box;
          },
          onRemove: () => {},
        },
        "bottom-right",
      );

      // A tile that does not arrive is normal — offline for a moment, a gap in coverage. It
      // leaves the rest of the map usable, so it is logged, never escalated to the panel.
      m.on("error", (e) => console.warn("mapa:", e.error?.message ?? e));
      m.getCanvas().addEventListener("webglcontextlost", () => setFailed(true));

      m.on("load", () => {
        if (cancelled) return;
        addOverlays(m, ml, areas);
        ready.current = true;
        // Props may have moved while the style loaded.
        syncAreas(m, areas);
        syncPins(m, ml);
        fit(m, ml, areas, now.current.zona, true);
      });

      // One observer, so a sidebar that opens or a phone that rotates re-measures the canvas.
      const ro = new ResizeObserver(() => m.resize());
      ro.observe(ref.current);

      // Escape closes whatever preview is open, from the keyboard.
      const onKey = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        for (const p of pins.current.values()) p.popup.remove();
      };
      ref.current.addEventListener("keydown", onKey);
      const el = ref.current;

      stop = () => {
        ro.disconnect();
        el.removeEventListener("keydown", onKey);
        m.remove();
        map.current = undefined;
        ready.current = false;
        pins.current.clear();
      };
    })();

    return () => {
      cancelled = true;
      stop();
    };
    // The helpers above are `useCallback(fn, [])` over refs only, so this list is stable and the
    // map is built exactly once. That is the whole fix for F10.
  }, [addOverlays, syncAreas, syncPins, fit, backToAll]);

  // ---- 2. theme: re-paint in place. Camera, markers, sources and selection all survive -------
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    repaint(m, readTokens());
    for (const { level, bump } of LEVELS) {
      const p = areaPaint(now.current.zona, bump);
      set(m, `areas-line-${level}`, p.line);
      set(m, `areas-fill-${level}`, p.fill);
      set(m, `areas-label-${level}`, p.label);
    }
    const a = approxPaint();
    set(m, "approx-line", a.line);
    set(m, "approx-fill", a.fill);
  }, [theme, set]);

  // ---- 3. data: move the markers and the counts; never move the camera ----------------------
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    void (async () => {
      const [ml, areas] = await Promise.all([import("maplibre-gl"), getAreas()]);
      if (map.current !== m) return;
      syncAreas(m, areas);
      syncPins(m, ml);
      // If the open preview's home fell out of the results, say so instead of leaving a ghost.
      if (activeId.current && !now.current.markers.some((k) => k.id === activeId.current)) {
        activeId.current = undefined;
        announce("La propiedad seleccionada no coincide con los filtros");
        (m.getSource("approx") as { setData?: (d: unknown) => void } | undefined)?.setData?.(circleFor(undefined));
      }
    })();
  }, [markers, syncAreas, syncPins, announce]);

  // ---- 4. selection: the only thing allowed to move the camera -------------------------------
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    for (const { level, bump } of LEVELS) {
      const p = areaPaint(zona, bump);
      set(m, `areas-line-${level}`, p.line);
      set(m, `areas-fill-${level}`, p.fill);
    }
    void (async () => {
      const [ml, areas] = await Promise.all([import("maplibre-gl"), getAreas()]);
      if (map.current === m) fit(m, ml, areas, zona, false);
    })();
  }, [zona, set, fit]);

  // ---- Hover and focus sync with the list, scoped to the results container -------------------
  useEffect(() => {
    const scope = ref.current?.closest("[data-results]");
    if (!scope) return; // the full-page map has no list beside it
    const onPoint = (e: Event) => {
      const id = (e.target as Element).closest?.("[data-property]")?.getAttribute("data-property");
      highlight(id ?? undefined);
    };
    scope.addEventListener("mouseover", onPoint);
    scope.addEventListener("focusin", onPoint);
    return () => {
      scope.removeEventListener("mouseover", onPoint);
      scope.removeEventListener("focusin", onPoint);
    };
  }, [highlight]);


  if (failed) {
    return (
      <div
        className={`${embedded ? "h-full" : "h-[calc(100dvh-var(--header-h)-var(--nav-bottom-h))]"} grid w-full place-items-center rounded-card border border-hairline bg-sunken p-6 text-center`}
      >
        <div className="max-w-sm space-y-2">
          <p className="font-medium">No se puede dibujar el mapa aquí.</p>
          <p className="text-sm text-muted">
            El navegador no ha podido iniciar el mapa. La lista tiene las mismas viviendas.
          </p>
          <Link className="btn-primary inline-flex touch-target" href="/propiedades">
            Ver la lista
          </Link>
        </div>
      </div>
    );
  }

  // Full page: top bar (64/80 px) and the phone bottom bar (56 px) are outside the map.
  return (
    <div
      ref={ref}
      className={embedded ? "h-full w-full" : "h-[calc(100dvh-var(--header-h)-var(--nav-bottom-h))] w-full"}
    >
      <div data-live aria-live="polite" className="sr-only" />
    </div>
  );
}

const pinTextFor = (g: PinGroup<MapMarker>) => (g.items.length > 1 ? String(g.items.length) : pinText(g.items[0]));
const pinLabelFor = (g: PinGroup<MapMarker>) => (g.items.length > 1 ? groupLabel(g) : pinLabel(g.items[0]));
/**
 * A popup link carries the list it was opened from, exactly as a card does, so the detail page
 * can come back to it. `params` is that list, already serialised (#80).
 */
const popupFor = (g: PinGroup<MapMarker>, params: Record<string, string>) => {
  const desde = new URLSearchParams(params).toString();
  return g.items.length > 1 ? chooser(g.items, desde) : card(g.items[0], desde);
};
