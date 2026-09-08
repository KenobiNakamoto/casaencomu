"use client";

import { useCallback, useSyncExternalStore } from "react";
import { MAX, parseIds, serialiseIds, storageKey, toggle, type ToggleResult } from "@/lib/selection";

/**
 * The selection as an external store. `useSyncExternalStore` is the standard React binding for
 * state that lives outside React — here, session storage — and it gives the server a snapshot,
 * so the first paint is empty rather than a hydration mismatch.
 *
 * ponytail: no context provider. Every control subscribes to the same module-level store, which
 * is all a provider would have given us.
 */
const listeners = new Set<() => void>();

/** `getSnapshot` must return the same reference until the value really changes, or React loops. */
const EMPTY: string[] = [];
let cached: { key: string; raw: string; ids: string[] } | null = null;

function readRaw(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? "";
  } catch {
    // Private mode, or storage disabled. Selection simply does not persist.
    return "";
  }
}

function snapshot(key: string): string[] {
  const raw = readRaw(key);
  if (cached?.key === key && cached.raw === raw) return cached.ids;
  const ids = parseIds(raw);
  cached = { key, raw, ids };
  return ids;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab of the same browser writes the same key; `storage` keeps them in step.
  addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    removeEventListener("storage", onChange);
  };
}

function save(key: string, ids: string[]) {
  try {
    sessionStorage.setItem(key, serialiseIds(ids));
  } catch {
    // Nothing to do: the change still applies for this page, it just will not outlive it.
  }
  cached = null;
  for (const fire of listeners) fire();
}

export function useSelection(userId: string) {
  const key = storageKey(userId);
  const ids = useSyncExternalStore(
    subscribe,
    () => snapshot(key),
    () => EMPTY,
  );
  const set = useCallback((next: string[]) => save(key, next.slice(0, MAX)), [key]);
  const flip = useCallback(
    (id: string): ToggleResult => {
      const result = toggle(snapshot(key), id);
      if (!result.full) save(key, result.ids);
      return result;
    },
    [key],
  );
  const clear = useCallback(() => save(key, []), [key]);
  return { ids, set, flip, clear };
}
