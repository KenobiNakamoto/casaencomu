"use client";

import { useEffect } from "react";

/**
 * How far the map grows while the toolbar scrolls away — measured, not guessed.
 *
 * `--map-grow` used to be a constant 232px. The real distance is the map column's own offset
 * from where it comes to rest, and it changes whenever the toolbar does: a chip row that wraps,
 * the bubbles that appear when a filter is on. When the constant was too big the map stopped
 * short of the bottom of the screen at rest, which is what it did.
 *
 * This moves the frame, never the map: `.map-frame > *` is sized from `--map-h-full`, which does
 * not read this variable. No WebGL buffer is reallocated (#117).
 */
export function MapFit() {
  useEffect(() => {
    const column = document.querySelector<HTMLElement>(".map-column");
    const frame = column?.firstElementChild;
    if (!column || !frame) return;

    const fit = () => {
      const rest = Number.parseFloat(getComputedStyle(frame).top) || 0;
      const travel = column.getBoundingClientRect().top + window.scrollY - rest;
      document.documentElement.style.setProperty("--map-grow", `${Math.max(0, Math.round(travel))}px`);
    };

    fit();
    // ponytail: the body catches every reflow that moves the column — a wrapped chip row, a
    // window resize, a filter applied. No scroll listener; the growth itself is still CSS.
    const ro = new ResizeObserver(fit);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);

  return null;
}
