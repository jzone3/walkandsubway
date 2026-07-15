import { Itinerary, WalkLeg } from "@/lib/types";
import {
  Coordinate,
  PedestrianPath,
  PedestrianRouter,
  RateLimitError,
} from "./types";
import { LruCache, walkPairKey } from "./cache";
import {
  CACHE_MAX_ENTRIES,
  CACHE_TTL_MS,
  HYDRATION_DEADLINE_MS,
  MAX_CONCURRENT_DIRECTIONS,
  MAX_LEGS_TO_HYDRATE,
  MIN_HYDRATION_METERS,
  PEDESTRIAN_TIMEOUT_MS,
} from "./constants";

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

// Per-process cache only: serverless instances do not share entries, and
// entries disappear when an instance is recycled. A shared cache (Redis/KV)
// is a future concern per the spec.
const defaultCache = new LruCache<PedestrianPath>(CACHE_MAX_ENTRIES, CACHE_TTL_MS);

export interface HydrateOptions {
  cache?: LruCache<PedestrianPath>;
  now?: () => number;
}

/**
 * Attach routed geometry and durations to access/egress/direct-walk legs.
 * Mutates itineraries in place. Never throws: the pedestrian provider is an
 * enhancement dependency, not a reason for the transit search to fail.
 */
export async function hydrateWalkingGeometry(
  router: PedestrianRouter,
  itineraries: Itinerary[],
  opts: HydrateOptions = {}
): Promise<void> {
  const cache = opts.cache ?? defaultCache;
  const now = opts.now ?? Date.now;

  const targets = collectTargets(itineraries);
  const paths = new Map<string, PedestrianPath>();
  const misses: HydrationTarget[] = [];
  for (const t of targets) {
    const hit = cache.get(t.key);
    if (hit) paths.set(t.key, hit);
    else misses.push(t);
  }
  // the cap bounds provider fetches; cache hits are free and don't consume it
  const queue = misses.slice(0, MAX_LEGS_TO_HYDRATE);

  const deadline = now() + HYDRATION_DEADLINE_MS;
  let rateLimited = false;

  const worker = async () => {
    for (;;) {
      // don't start a request that couldn't finish before the stage deadline
      const remaining = deadline - now();
      if (rateLimited || remaining < PEDESTRIAN_TIMEOUT_MS) return;
      const target = queue.shift();
      if (!target) return;
      try {
        const path = await router.route(target.from, target.to);
        cache.set(target.key, path);
        paths.set(target.key, path);
      } catch (err) {
        if (err instanceof RateLimitError) rateLimited = true;
        // any other failure: the target's legs keep their estimates
      }
    }
  };
  await Promise.all(
    Array.from({ length: MAX_CONCURRENT_DIRECTIONS }, () => worker())
  );

  for (const it of itineraries) applyPaths(it, paths);
}

/** Write a routed path into a leg; returns seconds delta, or null if not routed. */
function applyPathToLeg(
  leg: WalkLeg,
  paths: Map<string, PedestrianPath>
): number | null {
  if (leg.meters < MIN_HYDRATION_METERS) return null; // never a target
  const key = walkPairKey(
    { lat: leg.fromLat, lon: leg.fromLon },
    { lat: leg.toLat, lon: leg.toLon },
    PROVIDER
  );
  const path = paths.get(key);
  if (!path) {
    leg.routingSource = "estimate";
    return null;
  }
  const delta = path.seconds - leg.seconds;
  leg.geometry = path.geometry;
  leg.seconds = path.seconds;
  leg.meters = path.meters;
  leg.routingSource = "openrouteservice";
  return delta;
}

function applyPaths(it: Itinerary, paths: Map<string, PedestrianPath>): void {
  if (isDirectWalkItinerary(it)) {
    const leg = it.legs[0] as WalkLeg;
    const delta = applyPathToLeg(leg, paths);
    if (delta !== null) recomputeDirectWalk(it, leg.seconds);
    return;
  }
  let accessDelta = 0;
  let egressDelta = 0;
  const first = it.legs[0];
  if (first?.kind === "walk") accessDelta = applyPathToLeg(first, paths) ?? 0;
  const last = it.legs[it.legs.length - 1];
  if (last?.kind === "walk") egressDelta = applyPathToLeg(last, paths) ?? 0;
  if (accessDelta !== 0 || egressDelta !== 0) {
    recomputeTiming(it, accessDelta, egressDelta);
  }
}
