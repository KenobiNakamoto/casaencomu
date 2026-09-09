"use client";

import { useEffect, useRef } from "react";
import type { Map as MLMap, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildStyle, MAP_TOKENS, repaint, type MapTokens } from "@/lib/map-style";
import { useTheme } from "../use-theme";

// ponytail: three lines copied from `mapa/Mapa.tsx` rather than exported from `lib/map-style.ts`,
// which is a pure module with no DOM in it. Move it there if a third surface ever needs it.
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const readTokens = (): MapTokens => Object.fromEntries(MAP_TOKENS.map((t) => [t, css(t)])) as MapTokens;

/**
 * Where this home is, and no other. It reads the same vendored style and the same theme tokens as
 * the full map, so the two never disagree, and it carries no filters, no popup and no list: one
 * marker, and the camera on it.
 */
export function LocationMap({ lat, lng, precision }: { lat: number; lng: number; precision: "exact" | "approx" }) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const theme = useTheme();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // maplibre reads `window` on import, so it loads here and not at the top of the file.
      const ml = await import("maplibre-gl").catch(() => null);
      if (cancelled || !ml || !ref.current) return;
      let m: MLMap;
      try {
        m = new ml.Map({
          container: ref.current,
          style: buildStyle(readTokens()) as unknown as StyleSpecification,
          center: [lng, lat],
          // Close enough to read the streets around it, and no closer: the address of most
          // advertisements is approximate, and a tighter camera would claim more than we know.
          zoom: precision === "exact" ? 16 : 14.5,
          attributionControl: false,
          locale: { "NavigationControl.ZoomIn": "Acercar", "NavigationControl.ZoomOut": "Alejar", "AttributionControl.ToggleAttribution": "Ver los créditos del mapa" },
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
        });
      } catch {
        return; // no WebGL: the address in the caption is still on the page
      }
      map.current = m;
      // A theme change while the style was still loading was lost: `repaint` skips any layer the
      // map does not have yet, so before `load` it is a no-op and nothing runs it again.
      m.once("load", () => repaint(m, readTokens()));
      m.touchZoomRotate.disableRotation();
      m.addControl(new ml.NavigationControl({ showCompass: false, visualizePitch: false }), "top-right");
      m.addControl(new ml.AttributionControl({ compact: true }), "bottom-right");

      const el = document.createElement("div");
      el.className = precision === "exact" ? "here" : "here here-approx";
      new ml.Marker({ element: el }).setLngLat([lng, lat]).addTo(m);
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [lat, lng, precision]);

  // The style is rebuilt from the tokens rather than the map torn down, so the camera stays put.
  useEffect(() => {
    if (map.current) repaint(map.current, readTokens());
  }, [theme]);

  return <div ref={ref} className="h-full w-full" />;
}
