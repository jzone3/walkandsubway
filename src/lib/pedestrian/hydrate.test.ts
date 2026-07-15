import { describe, expect, it } from "vitest";
import { Itinerary, WalkLeg, TransitLeg } from "@/lib/types";
import { collectTargets } from "./hydrate";

export function walkLeg(overrides: Partial<WalkLeg> = {}): WalkLeg {
  return {
    kind: "walk",
    from: "Origin",
    fromLat: 40.758,
    fromLon: -73.9855,
    to: "Stop A",
    toLat: 40.7681,
    toLon: -73.9819,
    seconds: 600,
    meters: 800,
    ...overrides,
  };
}

export function transitLeg(overrides: Partial<TransitLeg> = {}): TransitLeg {
  return {
    kind: "transit",
    routeId: "1",
    routeName: "1",
    routeColor: "EE352E",
    routeType: 1,
    headsign: "Uptown",
    boardStop: "Stop A",
    alightStop: "Stop B",
    boardTime: 32400, // 09:00:00
    alightTime: 33000, // 09:10:00
    stops: [],
    ...overrides,
  };
}

export function itinerary(legs: (WalkLeg | TransitLeg)[], overrides: Partial<Itinerary> = {}): Itinerary {
  const walkSeconds = legs
    .filter((l): l is WalkLeg => l.kind === "walk")
    .reduce((s, l) => s + l.seconds, 0);
  const transit = legs.filter((l): l is TransitLeg => l.kind === "transit");
  const rideSeconds = transit.reduce((s, l) => s + (l.alightTime - l.boardTime), 0);
  const departTime = overrides.departTime ?? 31800;
  const arriveTime = overrides.arriveTime ?? 33600;
  return {
    departTime,
    arriveTime,
    totalSeconds: arriveTime - departTime,
    walkSeconds,
    waitSeconds: Math.max(0, arriveTime - departTime - walkSeconds - rideSeconds),
    rideSeconds,
    transfers: Math.max(0, transit.length - 1),
    legs,
    key: "test-itinerary",
    ...overrides,
  };
}

describe("collectTargets", () => {
  it("collects access and egress walk legs, not interior transfers", () => {
    const access = walkLeg();
    const transfer = walkLeg({ fromLat: 40.75, fromLon: -73.99, toLat: 40.751, toLon: -73.991 });
    const egress = walkLeg({ fromLat: 40.8, fromLon: -73.95, toLat: 40.81, toLon: -73.94 });
    const it1 = itinerary([access, transitLeg(), transfer, transitLeg(), egress]);
    const targets = collectTargets([it1]);
    expect(targets.length).toBe(2);
    const legs = targets.flatMap((t) => t.legs);
    expect(legs).toContain(access);
    expect(legs).toContain(egress);
    expect(legs).not.toContain(transfer);
  });

  it("treats a single-walk-leg itinerary as the direct walk and sorts it first", () => {
    const direct = walkLeg({ toLat: 40.9, toLon: -73.8 });
    const shared = walkLeg();
    const it1 = itinerary([shared, transitLeg()]);
    const it2 = itinerary([shared, transitLeg()]);
    const walkOnly = itinerary([direct], { key: "walk-only" });
    const targets = collectTargets([it1, it2, walkOnly]);
    expect(targets[0].isDirectWalk).toBe(true);
    expect(targets[0].legs).toEqual([direct]);
  });

  it("deduplicates identical coordinate pairs across itineraries and counts refs", () => {
    const a1 = walkLeg();
    const a2 = walkLeg(); // same coordinates, different object
    const it1 = itinerary([a1, transitLeg()]);
    const it2 = itinerary([a2, transitLeg()]);
    const targets = collectTargets([it1, it2]);
    expect(targets.length).toBe(1);
    expect(targets[0].refCount).toBe(2);
    expect(targets[0].legs).toEqual([a1, a2]);
  });

  it("sorts higher-refCount pairs first (after direct walk)", () => {
    const popular = walkLeg();
    const rare = walkLeg({ fromLat: 40.7, fromLon: -73.99, toLat: 40.71, toLon: -73.98 });
    const its = [
      itinerary([popular, transitLeg()]),
      itinerary([popular, transitLeg()]),
      itinerary([rare, transitLeg()]),
    ];
    const targets = collectTargets(its);
    expect(targets[0].legs).toContain(popular);
    expect(targets[1].legs).toContain(rare);
  });

  it("skips degenerate legs under MIN_HYDRATION_METERS", () => {
    const tiny = walkLeg({ meters: 10 });
    const it1 = itinerary([tiny, transitLeg()]);
    expect(collectTargets([it1])).toEqual([]);
  });

  it("ignores itineraries that start or end with transit", () => {
    const it1 = itinerary([transitLeg(), walkLeg()]);
    const targets = collectTargets([it1]);
    expect(targets.length).toBe(1); // egress only, no access
  });
});
