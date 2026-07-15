import { describe, expect, it } from "vitest";
import { Itinerary, WalkLeg, TransitLeg } from "@/lib/types";
import { collectTargets, recomputeDirectWalk, recomputeTiming, hydrateWalkingGeometry } from "./hydrate";
import { LruCache, walkPairKey } from "./cache";
import { PedestrianPath, PedestrianRouter, RateLimitError } from "./types";

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

describe("recomputeTiming", () => {
  it("shifts departTime back by the access delta and arriveTime forward by the egress delta", () => {
    const access = walkLeg({ seconds: 840 }); // routed: was 600
    const egress = walkLeg({
      seconds: 500, // routed: was 400
      fromLat: 40.8, fromLon: -73.95, toLat: 40.81, toLon: -73.94,
    });
    const it1 = itinerary([access, transitLeg(), egress], {
      departTime: 31800,
      arriveTime: 33400,
    });
    recomputeTiming(it1, 840 - 600, 500 - 400);
    expect(it1.departTime).toBe(31800 - 240);
    expect(it1.arriveTime).toBe(33400 + 100);
    expect(it1.walkSeconds).toBe(840 + 500);
    expect(it1.totalSeconds).toBe(it1.arriveTime - it1.departTime);
  });

  it("preserves hidden same-station transfer time (arrival anchored on old value, not alightTime)", () => {
    // RAPTOR: alight 33000, hidden transfer 120s, estimated egress 400s
    // => old arriveTime 33520, which is NOT alightTime + egress (33400)
    const access = walkLeg();
    const egress = walkLeg({
      seconds: 460, // routed: was 400
      fromLat: 40.8, fromLon: -73.95, toLat: 40.81, toLon: -73.94,
    });
    const it1 = itinerary([access, transitLeg(), egress], {
      departTime: 31800,
      arriveTime: 33520,
    });
    recomputeTiming(it1, 0, 460 - 400);
    // the 120s hidden transfer survives: 33520 + 60, not 33000 + 460
    expect(it1.arriveTime).toBe(33580);
  });

  it("allows departTime before the requested departure (documented PR 1 limitation)", () => {
    // requested departure 31800; routed access is 300s longer than estimated
    const access = walkLeg({ seconds: 900 });
    const it1 = itinerary([access, transitLeg()], {
      departTime: 31800,
      arriveTime: 33400,
    });
    recomputeTiming(it1, 300, 0);
    // honest recompute: departTime lands before 31800 and is NOT clamped
    expect(it1.departTime).toBe(31500);
  });

  it("clamps waitSeconds at zero", () => {
    // walk 2000s + ride 600s exceed the 1600s total: unclamped wait would
    // be 1600 - 2000 - 600 = -1000
    const access = walkLeg({ seconds: 2000 });
    const it1 = itinerary([access, transitLeg()], {
      departTime: 31800,
      arriveTime: 33400,
    });
    recomputeTiming(it1, 0, 0);
    expect(it1.waitSeconds).toBe(0);
  });
});

describe("recomputeDirectWalk", () => {
  it("keeps the requested departure and derives everything from routed seconds", () => {
    const leg = walkLeg({ seconds: 1100 });
    const it1 = itinerary([leg], { departTime: 31800, arriveTime: 32800, key: "walk-only" });
    recomputeDirectWalk(it1, 1100);
    expect(it1.departTime).toBe(31800);
    expect(it1.arriveTime).toBe(32900);
    expect(it1.walkSeconds).toBe(1100);
    expect(it1.totalSeconds).toBe(1100);
    expect(it1.waitSeconds).toBe(0);
  });
});

function fakePath(seconds: number, meters = 900): PedestrianPath {
  return {
    seconds,
    meters,
    geometry: [
      [40.758, -73.9855],
      [40.76, -73.984],
      [40.7681, -73.9819],
    ],
    provider: "openrouteservice",
  };
}

function fakeRouter(
  impl: (callCount: number) => Promise<PedestrianPath>
): PedestrianRouter & { calls: number } {
  const r = {
    calls: 0,
    async route() {
      r.calls++;
      return impl(r.calls);
    },
    async matrix(): Promise<never> {
      throw new Error("unused");
    },
  };
  return r;
}

describe("hydrateWalkingGeometry", () => {
  it("writes geometry, routed values, and routingSource, and recomputes timing", async () => {
    const access = walkLeg({ seconds: 600 });
    const it1 = itinerary([access, transitLeg()], { departTime: 31800, arriveTime: 33400 });
    const router = fakeRouter(async () => fakePath(840));
    await hydrateWalkingGeometry(router, [it1], { cache: new LruCache(10, 1000) });
    expect(access.geometry?.length).toBe(3);
    expect(access.seconds).toBe(840);
    expect(access.meters).toBe(900);
    expect(access.routingSource).toBe("openrouteservice");
    expect(it1.departTime).toBe(31800 - 240);
    expect(it1.walkSeconds).toBe(840);
  });

  it("uses the directions result as canonical for the direct walk", async () => {
    const leg = walkLeg({ seconds: 1000 });
    const walkOnly = itinerary([leg], { departTime: 31800, arriveTime: 32800, key: "walk-only" });
    const router = fakeRouter(async () => fakePath(1100));
    await hydrateWalkingGeometry(router, [walkOnly], { cache: new LruCache(10, 1000) });
    expect(walkOnly.arriveTime).toBe(31800 + 1100);
    expect(walkOnly.totalSeconds).toBe(1100);
  });

  it("issues one request per unique pair and hydrates every matching leg", async () => {
    const a1 = walkLeg();
    const a2 = walkLeg();
    const it1 = itinerary([a1, transitLeg()]);
    const it2 = itinerary([a2, transitLeg()]);
    const router = fakeRouter(async () => fakePath(700));
    await hydrateWalkingGeometry(router, [it1, it2], { cache: new LruCache(10, 1000) });
    expect(router.calls).toBe(1);
    expect(a1.routingSource).toBe("openrouteservice");
    expect(a2.routingSource).toBe("openrouteservice");
  });

  it("serves repeat searches from the cache with zero provider calls", async () => {
    const cache = new LruCache<PedestrianPath>(10, 100000);
    const router1 = fakeRouter(async () => fakePath(700));
    await hydrateWalkingGeometry(router1, [itinerary([walkLeg(), transitLeg()])], { cache });
    const router2 = fakeRouter(async () => fakePath(700));
    const leg = walkLeg();
    await hydrateWalkingGeometry(router2, [itinerary([leg, transitLeg()])], { cache });
    expect(router2.calls).toBe(0);
    expect(leg.routingSource).toBe("openrouteservice");
  });

  it("leaves estimates and endpoints intact on per-leg failure", async () => {
    const access = walkLeg({ seconds: 600, meters: 800 });
    const it1 = itinerary([access, transitLeg()], { departTime: 31800, arriveTime: 33400 });
    const router = fakeRouter(async () => {
      throw new Error("timeout");
    });
    await hydrateWalkingGeometry(router, [it1], { cache: new LruCache(10, 1000) });
    expect(access.seconds).toBe(600);
    expect(access.meters).toBe(800);
    expect(access.geometry).toBeUndefined();
    expect(access.routingSource).toBe("estimate");
    expect(it1.departTime).toBe(31800); // timing untouched
  });

  it("stops issuing requests after a RateLimitError", async () => {
    const legs = Array.from({ length: 6 }, (_, i) =>
      walkLeg({ fromLat: 40.7 + i * 0.01, toLat: 40.71 + i * 0.01 })
    );
    const its = legs.map((l) => itinerary([l, transitLeg()]));
    const router = fakeRouter(async (n) => {
      if (n === 1) throw new RateLimitError("429");
      return fakePath(700);
    });
    await hydrateWalkingGeometry(router, its, { cache: new LruCache(10, 1000) });
    // concurrency is 4: at most the first wave was in flight when 429 hit
    expect(router.calls).toBeLessThanOrEqual(4);
    expect(legs.every((l) => l.routingSource !== undefined)).toBe(true);
  });

  it("never starts a request that cannot finish before the stage deadline", async () => {
    const legs = Array.from({ length: 12 }, (_, i) =>
      walkLeg({ fromLat: 40.7 + i * 0.01, toLat: 40.71 + i * 0.01 })
    );
    const its = legs.map((l) => itinerary([l, transitLeg()]));
    let clock = 0;
    const router = fakeRouter(async () => {
      clock += 3500; // worst case: every request runs to its full timeout
      return fakePath(700);
    });
    await hydrateWalkingGeometry(router, its, {
      cache: new LruCache(100, 100000),
      now: () => clock,
    });
    // scheduling window is deadline minus one full timeout (8000 - 3500):
    // requests start at t=0 and t=3500; at t=7000 the remaining 1000ms
    // cannot fit a 3500ms request, so exactly two are issued and the whole
    // stage settles inside the 8000ms deadline
    expect(router.calls).toBe(2);
    expect(clock).toBeLessThanOrEqual(8000);
  });

  it("does not let cache hits consume the fetch cap", async () => {
    const cache = new LruCache<PedestrianPath>(100, 100000);
    const legs = Array.from({ length: 25 }, (_, i) =>
      walkLeg({ fromLat: 40.5 + i * 0.01, toLat: 40.51 + i * 0.01 })
    );
    // pre-cache the first 24 pairs (they rank ahead of the last one)
    for (const l of legs.slice(0, 24)) {
      cache.set(
        walkPairKey(
          { lat: l.fromLat, lon: l.fromLon },
          { lat: l.toLat, lon: l.toLon },
          "openrouteservice"
        ),
        fakePath(700)
      );
    }
    const its = legs.map((l) => itinerary([l, transitLeg()]));
    const router = fakeRouter(async () => fakePath(700));
    await hydrateWalkingGeometry(router, its, { cache });
    expect(router.calls).toBe(1); // only the single miss is fetched
    expect(legs.every((l) => l.routingSource === "openrouteservice")).toBe(true);
  });

  it("hydrates at most MAX_LEGS_TO_HYDRATE unique pairs, direct walk first", async () => {
    const legs = Array.from({ length: 30 }, (_, i) =>
      walkLeg({ fromLat: 40.5 + i * 0.01, toLat: 40.51 + i * 0.01 })
    );
    const its = legs.map((l) => itinerary([l, transitLeg()]));
    const direct = walkLeg({ fromLat: 40.99, toLat: 41.0 });
    its.push(itinerary([direct], { key: "walk-only" }));
    const router = fakeRouter(async () => fakePath(700));
    await hydrateWalkingGeometry(router, its, { cache: new LruCache(100, 1000) });
    expect(router.calls).toBe(24);
    expect(direct.routingSource).toBe("openrouteservice");
    // some access legs beyond the cap kept their estimates
    expect(legs.some((l) => l.routingSource === "estimate")).toBe(true);
  });

  it("shifts departTime on BOTH itineraries that share the same access-leg object", async () => {
    // raptor's walkVariants reuses the base itinerary's access walk leg
    // object (e.g. `...it.legs.slice(firstIdx + 1)`) across variants —
    // model that exactly: one WalkLeg object, two itineraries.
    const sharedAccess = walkLeg({ seconds: 600 }); // estimate 600s
    const base = itinerary([sharedAccess, transitLeg()], {
      departTime: 31800,
      arriveTime: 33400,
      key: "base",
    });
    const variant = itinerary([sharedAccess, transitLeg()], {
      departTime: 31800,
      arriveTime: 33400,
      key: "variant",
    });
    const router = fakeRouter(async () => fakePath(840)); // +240s vs estimate
    await hydrateWalkingGeometry(router, [base, variant], {
      cache: new LruCache(10, 100000),
    });
    expect(sharedAccess.seconds).toBe(840);
    expect(base.departTime).toBe(31800 - 240);
    // second itinerary shares the same (already-mutated) leg object; its
    // delta must still be computed against the original 600s estimate.
    expect(variant.departTime).toBe(31800 - 240);
    expect(variant.totalSeconds).toBe(variant.arriveTime - variant.departTime);
  });

  it("never rejects even if the router throws synchronously", async () => {
    const it1 = itinerary([walkLeg(), transitLeg()]);
    const router = {
      route() {
        throw new Error("sync boom");
      },
      matrix() {
        throw new Error("unused");
      },
    } as unknown as PedestrianRouter;
    await expect(
      hydrateWalkingGeometry(router, [it1], { cache: new LruCache(10, 1000) })
    ).resolves.toBeUndefined();
  });
});
