/**
 * The bars above a range slider: how many homes fall in each slice of the scale. Pure, so the
 * page can compute it from the rows it already has and the client component only draws.
 *
 * ponytail: counts, not densities. With a few dozen homes most slices are empty and that is the
 * honest picture; a smoothed curve would invent a distribution we do not have.
 */
export type Bars = { min: number; max: number; bars: number[] };

/** `count` slices between the lowest and highest value present. Fewer than two values: no bars. */
export function buckets(values: (number | null | undefined)[], count = 24): Bars | null {
  const xs = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (xs.length < 2) return null;
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  if (min === max) return null;
  const bars = new Array<number>(count).fill(0);
  for (const x of xs) bars[Math.min(count - 1, Math.floor(((x - min) / (max - min)) * count))]++;
  return { min, max, bars };
}

/**
 * A round step for the slider, so dragging lands on numbers a person would say out loud. Never
 * below 1: every scale here is counted in whole euros or whole square metres.
 */
export function niceStep(min: number, max: number): number {
  const span = Math.max(1, max - min);
  const pow = Math.max(1, 10 ** Math.floor(Math.log10(span / 40)));
  for (const m of [1, 2, 5, 10]) if (span / (pow * m) <= 60) return pow * m;
  return pow * 10;
}
