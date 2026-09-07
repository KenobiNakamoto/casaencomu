/**
 * Whether an advertisement is still up, kept strictly apart from what the family decided about
 * the home (decision D07). A portal taking a listing down is a fact about the portal; it is not
 * permission to erase `preseleccionada`.
 */

/** What one observation of a source produced. `extractResult()` names the first four. */
export type Outcome = "listing" | "removed" | "blocked" | "unreadable" | "timeout";

/** A source is what we last saw at one URL. A property can have several. */
export type SourceAvailability = "active" | "unknown" | "removed";

export type SourceState = {
  availability: SourceAvailability;
  /** Consecutive scheduled checks that produced removal evidence. Two confirm it. */
  consecutive_gone: number;
  /** Consecutive checks we could not read at all. Drives the one warning, never removal. */
  consecutive_failures: number;
};

/** Two scheduled checks in a row must agree before an advertisement counts as gone. */
export const GONE_CONFIRMATIONS = 2;
/** After this long without a successful observation, "active" is stale rather than current. */
export const STALE_MS = 48 * 3_600_000;

/**
 * The counters after one observation.
 *
 * The gone streak is its own counter, which is finding F05: a 403 and a 404 used to increment the
 * same number, so one blocked page followed by one genuine 404 reached the removal branch and
 * deleted a property the family was still considering. A streak means *consecutive*, so anything
 * that is not removal evidence resets it — including a success.
 *
 * `scheduled` separates the hourly loop from a person pressing Comprobar. Only the loop can
 * confirm a removal; a manual check that finds nothing is never the second strike, because the
 * two would not be independent observations of the advertisement.
 */
export function nextSourceState(prev: SourceState, outcome: Outcome, scheduled: boolean): SourceState {
  if (outcome === "listing") {
    return { availability: "active", consecutive_gone: 0, consecutive_failures: 0 };
  }
  if (outcome === "removed") {
    const gone = scheduled ? prev.consecutive_gone + 1 : prev.consecutive_gone;
    return {
      availability: gone >= GONE_CONFIRMATIONS ? "removed" : "unknown",
      consecutive_gone: gone,
      consecutive_failures: 0,
    };
  }
  // blocked, unreadable, timeout: evidence about us, not about the advertisement
  return {
    availability: "unknown",
    consecutive_gone: 0,
    consecutive_failures: prev.consecutive_failures + 1,
  };
}

/**
 * One property from all of its sources. A second portal still carrying the advertisement is
 * enough to keep the home available: a home does not disappear because one agency delisted it.
 */
export function propertyAvailability(sources: { availability: SourceAvailability }[]): SourceAvailability {
  if (!sources.length) return "unknown"; // nothing to check is not the same as gone
  if (sources.some((s) => s.availability === "active")) return "active";
  if (sources.some((s) => s.availability === "unknown")) return "unknown";
  return "removed";
}

/** `active` means the last successful read said so. After 48 h that is a claim about the past. */
export const isStale = (lastOkAt: string | null | undefined, now: Date): boolean =>
  !lastOkAt || now.getTime() - Date.parse(lastOkAt) > STALE_MS;

/**
 * One Spanish phrase per availability, for the chip and the activity feed. `unknown` says what is
 * actually true — the check did not succeed — rather than naming the advertisement removed, which
 * is finding F04: the feed rendered every availability event as "ya no está disponible",
 * the `{to:"unknown"}` warnings included.
 */
export const AVAILABILITY_LABEL: Record<SourceAvailability, string> = {
  active: "Anuncio activo",
  unknown: "Sin comprobar",
  removed: "Anuncio retirado",
};

export const availabilityLine = (to: string, title: string): string => {
  switch (to) {
    case "removed":
      return `${title}: el anuncio ya no está publicado`;
    case "unknown":
      return `${title}: no se pudo comprobar el anuncio`;
    case "active":
      return `${title}: el anuncio vuelve a estar disponible`;
    default:
      return `${title}: cambió la disponibilidad`;
  }
};

/**
 * The SQL for "this property is not confirmed removed", for the list, the map and the markers,
 * which used to disagree by filtering on the retired `no_disponible` stage (finding F29). A
 * property with no sources at all is not removed — there is simply nothing to check. Expects the
 * properties table aliased `p`.
 */
export const NOT_REMOVED_SQL = `(
  EXISTS (SELECT 1 FROM sources s WHERE s.property_id = p.id AND s.availability != 'removed')
  OR NOT EXISTS (SELECT 1 FROM sources s WHERE s.property_id = p.id)
)`;
