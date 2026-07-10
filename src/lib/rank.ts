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
  // the slider sets a total-trip-time budget: leftmost = only the fastest
  // option, rightmost = every option no matter how long. The budget is a
  // quantile of the observed total times so the options unlock uniformly
  // across the slider. Within budget, the most walking wins (faster breaks
  // ties); over-budget options follow, fastest first.
  if (itins.length === 0) return [];
  const totals = [...new Set(itins.map((it) => it.totalSeconds))].sort((a, b) => a - b);
  const pos = s * (totals.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const budget = totals[lo] + (totals[hi] - totals[lo]) * (pos - lo);
  const scored = itins.map((it) => ({ it, over: it.totalSeconds > budget }));
  scored.sort((a, b) => {
    if (a.over !== b.over) return a.over ? 1 : -1;
    if (a.over) return a.it.totalSeconds - b.it.totalSeconds;
    if (b.it.walkSeconds !== a.it.walkSeconds) return b.it.walkSeconds - a.it.walkSeconds;
    return a.it.totalSeconds - b.it.totalSeconds;
  });
  const out: Itinerary[] = [];
  const seen = new Set<string>();
  const seenLines = new Set<string>();
  for (const { it } of scored) {
    if (seen.has(it.key)) continue;
    // collapse near-duplicates: same lines between the same stations count
    // as one option (later departures of the same trip); different
    // board/alight stations (e.g. overshoots) stay distinct
    const lines = it.legs
      .filter((l) => l.kind === "transit")
      .map((l) => `${l.routeId}:${l.boardStop}>${l.alightStop}`)
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
