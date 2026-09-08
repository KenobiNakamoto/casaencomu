"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { blockedReason, FULL_MESSAGE, MAX, serialiseIds, trayLabel } from "@/lib/selection";
import { useSelection } from "./use-selection";

/**
 * The checkbox on a card, a row or a detail page. It is a sibling of the link, never inside it:
 * a control nested in an anchor cannot be reached by keyboard without also following the link.
 */
export function CompareToggle({
  userId,
  id,
  label,
  className = "",
}: {
  userId: string;
  id: string;
  label: string;
  className?: string;
}) {
  const { ids, flip } = useSelection(userId);
  const [full, setFull] = useState(false);
  const checked = ids.includes(id);

  useEffect(() => {
    if (!full) return;
    const t = setTimeout(() => setFull(false), 6000);
    return () => clearTimeout(t);
  }, [full]);

  return (
    <span className={`compare-toggle ${className}`}>
      <label className="compare-box">
        <input
          type="checkbox"
          checked={checked}
          // A refused fifth must not leave the box looking checked.
          onChange={() => setFull(flip(id).full)}
          aria-label={`Comparar ${label}`}
        />
        <span aria-hidden>Comparar</span>
      </label>
      {full && (
        <span role="status" className="compare-full">
          {FULL_MESSAGE}
        </span>
      )}
    </span>
  );
}

/**
 * The fixed tray. It appears only once something is selected, states the count in words, and
 * says how many of them the current filters are hiding, so a selection never seems to vanish.
 */
export function CompareTray({ userId, visible }: { userId: string; visible: string[] }) {
  const { ids, clear } = useSelection(userId);
  if (!ids.length) return null;

  const outside = ids.filter((id) => !visible.includes(id)).length;
  const blocked = blockedReason(ids.length);

  return (
    <div className="compare-tray" role="region" aria-label="Selección para comparar">
      {/* The sentence is the live region: it changes only when the selection does, so a screen
          reader hears the new count without a second hidden copy to keep in step. */}
      <p className="compare-count" role="status">
        {trayLabel(ids.length, outside)}
      </p>
      <div className="compare-actions">
        <button type="button" onClick={clear} className="compare-clear">
          Limpiar
        </button>
        {blocked ? (
          <span className="compare-blocked" aria-disabled>
            {blocked}
          </span>
        ) : (
          <Link href={`/comparar?ids=${serialiseIds(ids)}`} className="btn-primary compare-go">
            Comparar {ids.length}
          </Link>
        )}
      </div>
    </div>
  );
}

/** The count beside `Comparar` in the navigation. Client-side, because the selection is. */
export function CompareCount({ userId }: { userId: string }) {
  const { ids } = useSelection(userId);
  if (!ids.length) return null;
  return (
    <span className="nav-count" aria-label={`${ids.length} de ${MAX} seleccionadas`}>
      {ids.length}
    </span>
  );
}
