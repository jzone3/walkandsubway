import { Itinerary } from "./types";

// slider: 0 = minimize walking, 100 = walkmaxx (walking is nearly free, transfers are painful)
export function rankItineraries(itins: Itinerary[], slider: number, topN = 5): Itinerary[] {
  const s = Math.min(100, Math.max(0, slider)) / 100;
  const walkWeight = 2.0 - 1.9 * s; // 2.0 -> 0.1
  const transferPenalty = 120 + 2280 * s; // 2min -> 40min equivalent
  const scored = itins.map((it) => ({
    it,
    score:
      it.rideSeconds +
      it.waitSeconds +
      it.walkSeconds * walkWeight +
      it.transfers * transferPenalty,
  }));
  scored.sort((a, b) => a.score - b.score);
  const out: Itinerary[] = [];
  const seen = new Set<string>();
  for (const { it } of scored) {
    if (seen.has(it.key)) continue;
    seen.add(it.key);
    out.push(it);
    if (out.length >= topN) break;
  }
  return out;
}
