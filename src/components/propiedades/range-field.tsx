"use client";

import { useId, useState } from "react";
import type { Bars } from "@/lib/buckets";
import { input } from "./format";

/**
 * One bounded filter: the bars, a two-handle slider under them, and the two numbers under that.
 * Price and surface are the same control at a different scale, so there is one of these.
 *
 * The state is the two strings a person typed, not two numbers, so an empty box stays empty and
 * the slider is only ever a second way to write in the same boxes. Empty means unbounded on that
 * side, and both empty means no filter at all — which is what `Quitar filtros` has to be able to
 * leave behind.
 *
 * The URL carries `min-max` under one key, so the field that submits is hidden and written here.
 */
type Props = {
  /** The URL key: `precio`, `m2`. */
  name: string;
  title: string;
  unit: string;
  /** Null when there is nothing to draw — one home, or every home at the same number. */
  bars: Bars | null;
  step: number;
  defMin: string;
  defMax: string;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export function RangeField({ name, title, unit, bars, step, defMin, defMax }: Props) {
  const id = useId();
  const [lo, setLo] = useState(defMin);
  const [hi, setHi] = useState(defMax);

  const min = bars?.min ?? 0;
  const max = bars?.max ?? 0;
  const loN = clamp(Number(lo) || min, min, max);
  const hiN = clamp(Number(hi) || max, min, max);
  const pct = (n: number) => (max === min ? 0 : ((n - min) / (max - min)) * 100);
  const tallest = Math.max(1, ...(bars?.bars ?? [1]));
  // A handle back at its own end is not a bound, so it writes an empty half.
  const write = (n: number, end: number) => (n === end ? "" : String(n));

  const box = "flex flex-col gap-1.5 text-xs font-semibold text-muted";

  return (
    <div className="bento min-w-0">
      <p className="mb-3 text-sm font-semibold text-ink">
        {title} <span className="font-normal text-muted">({unit})</span>
      </p>

      <input type="hidden" name={name} value={lo || hi ? `${lo}-${hi}` : ""} />

      {bars && (
        <>
          <div className="flex h-16 items-end gap-px" aria-hidden>
            {bars.bars.map((n, i) => {
              const at = min + ((i + 0.5) / bars.bars.length) * (max - min);
              return (
                <div
                  key={i}
                  className={`min-w-0 flex-1 rounded-t-sm transition-colors ${at >= loN && at <= hiN ? "bg-secondary/50" : "bg-hairline"}`}
                  style={{ height: `${Math.max(3, (n / tallest) * 100)}%` }}
                />
              );
            })}
          </div>

          <div className="range-pair mt-1">
            <div className="range-track">
              <span style={{ left: `${pct(loN)}%`, right: `${100 - pct(hiN)}%` }} />
            </div>
            <input
              type="range"
              aria-label={`${title} mínimo`}
              min={min}
              max={max}
              step={step}
              value={loN}
              onChange={(e) => setLo(write(Math.min(Number(e.target.value), hiN), min))}
            />
            <input
              type="range"
              aria-label={`${title} máximo`}
              min={min}
              max={max}
              step={step}
              value={hiN}
              onChange={(e) => setHi(write(Math.max(Number(e.target.value), loN), max))}
            />
          </div>
        </>
      )}

      <div className={`grid grid-cols-2 gap-3 ${bars ? "mt-2" : ""}`}>
        <label className={box} htmlFor={`${id}-min`}>
          Mínimo
          <input
            id={`${id}-min`}
            type="number"
            inputMode="numeric"
            min={0}
            step={step}
            className={input}
            value={lo}
            placeholder={bars ? String(min) : unit}
            onChange={(e) => setLo(e.target.value.replace(/\D/g, ""))}
          />
        </label>
        <label className={box} htmlFor={`${id}-max`}>
          Máximo
          <input
            id={`${id}-max`}
            type="number"
            inputMode="numeric"
            min={0}
            step={step}
            className={input}
            value={hi}
            placeholder={bars ? String(max) : unit}
            onChange={(e) => setHi(e.target.value.replace(/\D/g, ""))}
          />
        </label>
      </div>
    </div>
  );
}
