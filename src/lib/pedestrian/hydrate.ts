import { Itinerary, WalkLeg } from "@/lib/types";
import { Coordinate } from "./types";
import { walkPairKey } from "./cache";
import { MIN_HYDRATION_METERS } from "./constants";

const PROVIDER = "openrouteservice";

export interface HydrationTarget {
  key: string;
  from: Coordinate;
  to: Coordinate;
  /** Every leg (across all itineraries) sharing this coordinate pair. */
  legs: WalkLeg[];
  refCount: number;
  isDirectWalk: boolean;
}

function isDirectWalkItinerary(it: Itinerary): boolean {
  return it.legs.length === 1 && it.legs[0].kind === "walk";
}

export function collectTargets(itineraries: Itinerary[]): HydrationTarget[] {
  const byKey = new Map<string, HydrationTarget>();

  const add = (leg: WalkLeg, isDirectWalk: boolean) => {
    if (leg.meters < MIN_HYDRATION_METERS) return;
    const from = { lat: leg.fromLat, lon: leg.fromLon };
    const to = { lat: leg.toLat, lon: leg.toLon };
    const key = walkPairKey(from, to, PROVIDER);
    const existing = byKey.get(key);
    if (existing) {
      existing.legs.push(leg);
      existing.refCount++;
      existing.isDirectWalk = existing.isDirectWalk || isDirectWalk;
    } else {
      byKey.set(key, { key, from, to, legs: [leg], refCount: 1, isDirectWalk });
    }
  };

  for (const it of itineraries) {
    if (isDirectWalkItinerary(it)) {
      add(it.legs[0] as WalkLeg, true);
      continue;
    }
    const first = it.legs[0];
    if (first?.kind === "walk") add(first, false);
    const last = it.legs[it.legs.length - 1];
    if (last?.kind === "walk") add(last, false);
  }

  return [...byKey.values()].sort((a, b) => {
    if (a.isDirectWalk !== b.isDirectWalk) return a.isDirectWalk ? -1 : 1;
    return b.refCount - a.refCount;
  });
}

/**
 * Delta-based recompute anchored on pre-hydration values. Never re-derive
 * from transit-leg times: RAPTOR's arriveTime includes hidden in-station
 * transfer time after the last transit leg, and same-named-station transfer
 * walks are deliberately omitted from legs.
 *
 * Known PR 1 limitation (documented in the spec): a positive access delta
 * can push departTime before the requested departure. We keep the honest
 * recomputed time — re-selecting a later trip requires feeding routed
 * durations into RAPTOR, which is PR 2.
 */
export function recomputeTiming(
  it: Itinerary,
  accessDeltaSeconds: number,
  egressDeltaSeconds: number
): void {
  it.departTime -= accessDeltaSeconds;
  it.arriveTime += egressDeltaSeconds;
  it.walkSeconds = it.legs
    .filter((l): l is WalkLeg => l.kind === "walk")
    .reduce((sum, l) => sum + l.seconds, 0);
  it.totalSeconds = it.arriveTime - it.departTime;
  it.waitSeconds = Math.max(
    0,
    it.totalSeconds - it.walkSeconds - it.rideSeconds
  );
}

/** The directions response is canonical for the walk-only itinerary. */
export function recomputeDirectWalk(it: Itinerary, routedSeconds: number): void {
  it.arriveTime = it.departTime + routedSeconds;
  it.walkSeconds = routedSeconds;
  it.totalSeconds = routedSeconds;
  it.waitSeconds = 0;
}
