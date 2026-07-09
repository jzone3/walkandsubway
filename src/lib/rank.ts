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
  const walkWeight = 1.8 - 1.25 * s; // 1.8 -> 0.55
  const transferPenalty = 120 + 1880 * s; // 2min -> ~33min equivalent
  const scored = itins.map((it) => ({
    it,
    score:
      it.rideSeconds +
      it.waitSeconds +
      it.walkSeconds * walkWeight +
      it.transfers * transferPenalty,
  }));
  scored.sort((a, b) => a.score - b.score);
  // fully maxxed: walking is the whole point — prefer the highest walking share
  if (s >= 1) {
    scored.sort(
      (a, b) =>
        b.it.walkSeconds / b.it.totalSeconds - a.it.walkSeconds / a.it.totalSeconds
    );
  }
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
