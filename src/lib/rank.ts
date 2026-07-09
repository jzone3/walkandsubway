import { Itinerary } from "./types";

// slider: 0 = minimize walking, 100 = walkmaxx (walking is nearly free, transfers are painful)
export function rankItineraries(
  itins: Itinerary[],
  slider: number,
  topN = 5,
  maxTransfers?: number
): Itinerary[] {
  if (maxTransfers !== undefined && maxTransfers >= 0) {
    itins = itins.filter((it) => it.transfers <= maxTransfers);
  }
  const s = Math.min(100, Math.max(0, slider)) / 100;
  // the slider picks a target amount of walking: leftmost = the least walking
  // any option needs, rightmost = walking the whole way. The target is a
  // quantile of the observed walk times (not a linear interpolation), so the
  // options are spread uniformly across the slider even when walk times
  // cluster near one end. Rank by how close each option's walk time is to
  // the target, with total time breaking ties.
  if (itins.length === 0) return [];
  const walks = [...new Set(itins.map((it) => it.walkSeconds))].sort((a, b) => a - b);
  const pos = s * (walks.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const target = walks[lo] + (walks[hi] - walks[lo]) * (pos - lo);
  const scored = itins.map((it) => ({
    it,
    score:
      Math.abs(it.walkSeconds - target) +
      0.25 * it.totalSeconds +
      it.transfers * 120,
  }));
  scored.sort((a, b) => a.score - b.score);
  const out: Itinerary[] = [];
  const seen = new Set<string>();
  const seenLines = new Set<string>();
  for (const { it } of scored) {
    if (seen.has(it.key)) continue;
    // collapse near-duplicates: same line sequence AND similar walk amount
    // (same lines with meaningfully different walking are distinct options)
    const lines = it.legs
      .filter((l) => l.kind === "transit")
      .map((l) => l.routeId)
      .join(">") || "walk";
    const lineSig = `${lines}#${Math.round(it.walkSeconds / 300)}`;
    if (seenLines.has(lineSig)) continue;
    seen.add(it.key);
    seenLines.add(lineSig);
    out.push(it);
    if (out.length >= topN) break;
  }
  return out;
}
