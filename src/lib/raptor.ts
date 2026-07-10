import { Timetable, Itinerary, Leg, TransitLeg } from "./types";
import { haversineMeters, walkSeconds, WALK_SPEED_MPS, DETOUR_FACTOR } from "./geo";

const MAX_ROUNDS = 5; // up to 4 transfers
const MIN_TRANSFER_SLACK = 60;

interface StopPattern {
  pattern: number;
  pos: number;
}

interface Indexed {
  patternsByStop: StopPattern[][];
  transfersByStop: [number, number][][]; // stop -> [toStop, seconds]
}

const indexCache = new WeakMap<Timetable, Indexed>();

function getIndex(tt: Timetable): Indexed {
  let idx = indexCache.get(tt);
  if (idx) return idx;
  const patternsByStop: StopPattern[][] = tt.stops.map(() => []);
  tt.patterns.forEach((p, pi) => {
    p.stops.forEach((s, pos) => patternsByStop[s].push({ pattern: pi, pos }));
  });
  const transfersByStop: [number, number][][] = tt.stops.map(() => []);
  for (const [from, to, secs] of tt.transfers) transfersByStop[from].push([to, secs]);
  idx = { patternsByStop, transfersByStop };
  indexCache.set(tt, idx);
  return idx;
}

type Parent =
  | { type: "access"; walkSecs: number }
  | { type: "trip"; pattern: number; trip: number; boardPos: number; alightPos: number; fromStop: number; round: number }
  | { type: "transfer"; fromStop: number; secs: number; round: number };

export interface RouteRequest {
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  departTime: number; // seconds since local midnight
  dayBit: number; // 0 = monday ... 6 = sunday
  maxAccessWalkSeconds?: number;
  banRouteIds?: string[];
}

export function route(tt: Timetable, req: RouteRequest): Itinerary[] {
  const { patternsByStop, transfersByStop } = getIndex(tt);
  const maxAccess = req.maxAccessWalkSeconds ?? 35 * 60;
  const maxAccessMeters = (maxAccess * WALK_SPEED_MPS) / DETOUR_FACTOR;
  const n = tt.stops.length;
  const dayMask = 1 << req.dayBit;
  const banned = new Set<number>();
  if (req.banRouteIds?.length) {
    tt.routes.forEach((r, i) => {
      if (req.banRouteIds!.includes(r.id)) banned.add(i);
    });
  }

  const access = new Map<number, number>(); // stop -> walk seconds
  const egress = new Map<number, number>();
  for (let s = 0; s < n; s++) {
    const st = tt.stops[s];
    const dOrig = haversineMeters(req.fromLat, req.fromLon, st.lat, st.lon);
    if (dOrig <= maxAccessMeters) access.set(s, walkSeconds(dOrig));
    const dDest = haversineMeters(req.toLat, req.toLon, st.lat, st.lon);
    if (dDest <= maxAccessMeters) egress.set(s, walkSeconds(dDest));
  }
  if (access.size === 0 || egress.size === 0) return directWalkOnly(req);

  const INF = Infinity;
  const rounds: Float64Array[] = [];
  const parents: Parent[][] = [];
  const best = new Float64Array(n).fill(INF);

  const r0 = new Float64Array(n).fill(INF);
  const p0: Parent[] = new Array(n);
  let marked = new Set<number>();
  for (const [s, w] of access) {
    r0[s] = req.departTime + w;
    p0[s] = { type: "access", walkSecs: w };
    best[s] = r0[s];
    marked.add(s);
  }
  rounds.push(r0);
  parents.push(p0);

  for (let k = 1; k <= MAX_ROUNDS; k++) {
    const prev = rounds[k - 1];
    const cur = Float64Array.from(rounds[k - 1]);
    const pcur: Parent[] = parents[k - 1].slice();
    const newlyMarked = new Set<number>();

    // collect patterns touching marked stops with earliest position
    const queue = new Map<number, number>(); // pattern -> min pos
    for (const s of marked) {
      for (const { pattern, pos } of patternsByStop[s]) {
        const existing = queue.get(pattern);
        if (existing === undefined || pos < existing) queue.set(pattern, pos);
      }
    }

    for (const [pi, startPos] of queue) {
      const pat = tt.patterns[pi];
      if (banned.has(pat.route)) continue;
      let tripIdx = -1;
      let boardPos = -1;
      for (let pos = startPos; pos < pat.stops.length; pos++) {
        const s = pat.stops[pos];
        // try to improve arrival by riding current trip
        if (tripIdx >= 0 && pos > boardPos) {
          const arr = pat.trips[tripIdx].arr[pos];
          if (arr < cur[s] && arr < best[s]) {
            cur[s] = arr;
            best[s] = arr;
            pcur[s] = { type: "trip", pattern: pi, trip: tripIdx, boardPos, alightPos: pos, fromStop: pat.stops[boardPos], round: k - 1 };
            newlyMarked.add(s);
          }
        }
        // can we catch an earlier trip at this stop?
        const readyAt = prev[s] + (k > 1 ? MIN_TRANSFER_SLACK : 0);
        if (readyAt < INF) {
          // find earliest active trip departing >= readyAt (trips sorted by dep[0], but dep[pos] is also monotone per pattern)
          let better = -1;
          for (let t = 0; t < pat.trips.length; t++) {
            const trip = pat.trips[t];
            if (!(tt.services[trip.svc] & dayMask)) continue;
            if (trip.dep[pos] >= readyAt) { better = t; break; }
          }
          if (better >= 0 && (tripIdx < 0 || pat.trips[better].dep[pos] < pat.trips[tripIdx].dep[pos])) {
            if (tripIdx < 0 || better !== tripIdx || pos < boardPos) {
              tripIdx = better;
              boardPos = pos;
            }
          }
        }
      }
    }

    // footpath / in-system transfer relaxation
    const toRelax = [...newlyMarked];
    for (const s of toRelax) {
      for (const [to, secs] of transfersByStop[s]) {
        const arr = cur[s] + secs;
        if (arr < cur[to] && arr < best[to]) {
          cur[to] = arr;
          best[to] = arr;
          pcur[to] = { type: "transfer", fromStop: s, secs, round: k };
          newlyMarked.add(to);
        }
      }
    }

    rounds.push(cur);
    parents.push(pcur);
    marked = newlyMarked;
    if (marked.size === 0) break;
  }

  // Build itineraries: for each round, best few egress stops
  const itineraries: Itinerary[] = [];
  const seen = new Set<string>();
  for (let k = 1; k < rounds.length; k++) {
    const cands: { s: number; arrive: number }[] = [];
    for (const [s, w] of egress) {
      const arr = rounds[k][s];
      if (arr < Infinity) cands.push({ s, arrive: arr + w });
    }
    cands.sort((a, b) => a.arrive - b.arrive);
    // keep only the best candidate per station name so different egress
    // stations surface instead of several platforms of the same one
    const byStation = new Map<string, { s: number; arrive: number }>();
    for (const c of cands) {
      const name = tt.stops[c.s].name;
      if (!byStation.has(name)) byStation.set(name, c);
    }
    for (const c of [...byStation.values()].slice(0, 10)) {
      const it = reconstruct(tt, req, rounds, parents, k, c.s, egress.get(c.s)!);
      if (!it) continue;
      if (seen.has(it.key)) continue;
      seen.add(it.key);
      itineraries.push(it);
    }
  }

  itineraries.push(...directWalkOnly(req));
  return itineraries;
}

function directWalkOnly(req: RouteRequest): Itinerary[] {
  const meters = haversineMeters(req.fromLat, req.fromLon, req.toLat, req.toLon);
  const secs = walkSeconds(meters);
  if (secs > 3 * 3600) return [];
  return [
    {
      departTime: req.departTime,
      arriveTime: req.departTime + secs,
      totalSeconds: secs,
      walkSeconds: secs,
      waitSeconds: 0,
      rideSeconds: 0,
      transfers: 0,
      key: "walk-only",
      legs: [
        {
          kind: "walk",
          from: "Origin",
          fromLat: req.fromLat,
          fromLon: req.fromLon,
          to: "Destination",
          toLat: req.toLat,
          toLon: req.toLon,
          seconds: secs,
          meters: Math.round(meters * DETOUR_FACTOR),
        },
      ],
    },
  ];
}

function reconstruct(
  tt: Timetable,
  req: RouteRequest,
  rounds: Float64Array[],
  parents: Parent[][],
  round: number,
  finalStop: number,
  egressWalk: number
): Itinerary | null {
  // walk back through parent pointers
  const legs: Leg[] = [];
  let s = finalStop;
  let k = round;
  let guard = 0;
  const transitLegs: TransitLeg[] = [];
  while (guard++ < 50) {
    const p = parents[k][s];
    if (!p) return null;
    if (p.type === "access") {
      const st = tt.stops[s];
      legs.unshift({
        kind: "walk",
        from: "Origin",
        fromLat: req.fromLat,
        fromLon: req.fromLon,
        to: st.name,
        toLat: st.lat,
        toLon: st.lon,
        seconds: p.walkSecs,
        meters: Math.round(haversineMeters(req.fromLat, req.fromLon, st.lat, st.lon) * DETOUR_FACTOR),
      });
      break;
    } else if (p.type === "transfer") {
      const from = tt.stops[p.fromStop];
      const to = tt.stops[s];
      if (from.name !== to.name) {
        legs.unshift({
          kind: "walk",
          from: from.name,
          fromLat: from.lat,
          fromLon: from.lon,
          to: to.name,
          toLat: to.lat,
          toLon: to.lon,
          seconds: p.secs,
          meters: Math.round(haversineMeters(from.lat, from.lon, to.lat, to.lon) * DETOUR_FACTOR),
        });
      }
      s = p.fromStop;
      k = p.round;
    } else {
      const pat = tt.patterns[p.pattern];
      const trip = pat.trips[p.trip];
      const routeInfo = tt.routes[pat.route];
      const stopsAlong = pat.stops.slice(p.boardPos, p.alightPos + 1).map((si, off) => ({
        name: tt.stops[si].name,
        lat: tt.stops[si].lat,
        lon: tt.stops[si].lon,
        arr: trip.arr[p.boardPos + off],
        dep: trip.dep[p.boardPos + off],
      }));
      const nextStops = pat.stops.slice(p.alightPos + 1, p.alightPos + 13).map((si, off) => ({
        name: tt.stops[si].name,
        lat: tt.stops[si].lat,
        lon: tt.stops[si].lon,
        arr: trip.arr[p.alightPos + 1 + off],
        dep: trip.dep[p.alightPos + 1 + off],
      }));
      // when's the next same-pattern trip from the board stop, if this one is missed?
      const dayMask = 1 << req.dayBit;
      let nextDep: number | undefined;
      for (const t of pat.trips) {
        if (!(tt.services[t.svc] & dayMask)) continue;
        const d = t.dep[p.boardPos];
        if (d > trip.dep[p.boardPos] && (nextDep === undefined || d < nextDep)) nextDep = d;
      }
      const leg: TransitLeg = {
        kind: "transit",
        routeId: routeInfo.id,
        routeName: routeInfo.name,
        routeColor: routeInfo.color,
        routeType: routeInfo.type,
        headsign: tt.stops[pat.stops[pat.stops.length - 1]].name,
        boardStop: tt.stops[pat.stops[p.boardPos]].name,
        alightStop: tt.stops[pat.stops[p.alightPos]].name,
        boardTime: trip.dep[p.boardPos],
        alightTime: trip.arr[p.alightPos],
        stops: stopsAlong,
        next: nextStops.length > 0 ? nextStops : undefined,
        headwaySecs: nextDep !== undefined ? nextDep - trip.dep[p.boardPos] : undefined,
      };
      legs.unshift(leg);
      transitLegs.unshift(leg);
      s = p.fromStop;
      k = p.round;
    }
  }
  if (transitLegs.length === 0) return null;

  const lastStop = tt.stops[finalStop];
  legs.push({
    kind: "walk",
    from: lastStop.name,
    fromLat: lastStop.lat,
    fromLon: lastStop.lon,
    to: "Destination",
    toLat: req.toLat,
    toLon: req.toLon,
    seconds: egressWalk,
    meters: Math.round(haversineMeters(lastStop.lat, lastStop.lon, req.toLat, req.toLon) * DETOUR_FACTOR),
  });

  // depart as late as possible: first board time minus access walk
  const firstLeg = legs[0];
  const firstTransit = transitLegs[0];
  const accessWalkSecs = firstLeg.kind === "walk" ? firstLeg.seconds : 0;
  const departTime = firstTransit.boardTime - accessWalkSecs;
  // use RAPTOR's computed arrival at the final stop so hidden in-station
  // transfers are accounted for
  const arriveTime = rounds[round][finalStop] + egressWalk;

  let walkSecs = 0;
  let rideSecs = 0;
  for (const l of legs) {
    if (l.kind === "walk") walkSecs += l.seconds;
    else rideSecs += l.alightTime - l.boardTime;
  }
  const totalSeconds = arriveTime - departTime;
  const waitSecs = Math.max(0, totalSeconds - walkSecs - rideSecs);

  const key = transitLegs.map((l) => `${l.routeId}@${l.boardStop}>${l.alightStop}`).join("|");
  return {
    departTime,
    arriveTime,
    totalSeconds,
    walkSeconds: walkSecs,
    waitSeconds: waitSecs,
    rideSeconds: rideSecs,
    transfers: transitLegs.length - 1,
    legs,
    key,
  };
}

const MAX_VARIANT_WALK = 35 * 60;
const MAX_VARIANT_EXTRA = 25 * 60;

function finalizeVariant(req: RouteRequest, legs: Leg[]): Itinerary | null {
  const transit = legs.filter((l): l is TransitLeg => l.kind === "transit");
  if (transit.length === 0) return null;
  const first = legs[0];
  const departTime = transit[0].boardTime - (first.kind === "walk" ? first.seconds : 0);
  const last = legs[legs.length - 1];
  const arriveTime = transit[transit.length - 1].alightTime + (last.kind === "walk" ? last.seconds : 0);
  let walkSecs = 0;
  let rideSecs = 0;
  for (const l of legs) {
    if (l.kind === "walk") walkSecs += l.seconds;
    else rideSecs += l.alightTime - l.boardTime;
  }
  const totalSeconds = arriveTime - departTime;
  return {
    departTime,
    arriveTime,
    totalSeconds,
    walkSeconds: walkSecs,
    waitSeconds: Math.max(0, totalSeconds - walkSecs - rideSecs),
    rideSeconds: rideSecs,
    transfers: transit.length - 1,
    legs,
    key: transit.map((l) => `${l.routeId}@${l.boardStop}>${l.alightStop}`).join("|"),
  };
}

// Generate walk-trading permutations of found itineraries: board the first
// train further along its line (walk more, ride less), hop off the last
// train early and walk the rest, or overshoot — stay on past the nearest
// stop and walk back. These are rarely time-optimal so RAPTOR alone won't
// surface them, but they're exactly what walkmaxxing wants.
export function walkVariants(req: RouteRequest, itins: Itinerary[]): Itinerary[] {
  const out: Itinerary[] = [];
  for (const it of itins) {
    const firstIdx = it.legs.findIndex((l) => l.kind === "transit");
    if (firstIdx < 0) continue;
    let lastIdx = -1;
    for (let i = it.legs.length - 1; i >= 0; i--) {
      if (it.legs[i].kind === "transit") { lastIdx = i; break; }
    }
    const firstLeg = it.legs[firstIdx] as TransitLeg;
    const lastLeg = it.legs[lastIdx] as TransitLeg;

    // board later along the first leg
    const bStep = Math.max(1, Math.floor((firstLeg.stops.length - 1) / 4));
    for (let j = bStep; j < firstLeg.stops.length - 1; j += bStep) {
      const c = firstLeg.stops[j];
      const w = walkSeconds(haversineMeters(req.fromLat, req.fromLon, c.lat, c.lon));
      if (w > MAX_VARIANT_WALK) continue;
      const newLeg: TransitLeg = {
        ...firstLeg,
        boardStop: c.name,
        boardTime: c.dep,
        stops: firstLeg.stops.slice(j),
      };
      const legs: Leg[] = [
        {
          kind: "walk",
          from: "Origin",
          fromLat: req.fromLat,
          fromLon: req.fromLon,
          to: c.name,
          toLat: c.lat,
          toLon: c.lon,
          seconds: w,
          meters: Math.round(haversineMeters(req.fromLat, req.fromLon, c.lat, c.lon) * DETOUR_FACTOR),
        },
        newLeg,
        ...it.legs.slice(firstIdx + 1),
      ];
      const v = finalizeVariant(req, legs);
      if (v && v.walkSeconds > it.walkSeconds && v.totalSeconds <= it.totalSeconds + MAX_VARIANT_EXTRA) out.push(v);
    }

    // alight earlier on the last leg
    const aStep = Math.max(1, Math.floor((lastLeg.stops.length - 1) / 4));
    for (let j = lastLeg.stops.length - 1 - aStep; j >= 1; j -= aStep) {
      const c = lastLeg.stops[j];
      const w = walkSeconds(haversineMeters(c.lat, c.lon, req.toLat, req.toLon));
      if (w > MAX_VARIANT_WALK) continue;
      const newLeg: TransitLeg = {
        ...lastLeg,
        alightStop: c.name,
        alightTime: c.arr,
        stops: lastLeg.stops.slice(0, j + 1),
      };
      const legs: Leg[] = [
        ...it.legs.slice(0, lastIdx),
        newLeg,
        {
          kind: "walk",
          from: c.name,
          fromLat: c.lat,
          fromLon: c.lon,
          to: "Destination",
          toLat: req.toLat,
          toLon: req.toLon,
          seconds: w,
          meters: Math.round(haversineMeters(c.lat, c.lon, req.toLat, req.toLon) * DETOUR_FACTOR),
        },
      ];
      const v = finalizeVariant(req, legs);
      if (v && v.walkSeconds > it.walkSeconds && v.totalSeconds <= it.totalSeconds + MAX_VARIANT_EXTRA) out.push(v);
    }

    // overshoot: ride the last leg past the nearest stop and walk back
    for (const c of lastLeg.next ?? []) {
      const w = walkSeconds(haversineMeters(c.lat, c.lon, req.toLat, req.toLon));
      if (w > MAX_VARIANT_WALK) continue;
      const upto = (lastLeg.next ?? []).indexOf(c);
      const newLeg: TransitLeg = {
        ...lastLeg,
        alightStop: c.name,
        alightTime: c.arr,
        stops: [...lastLeg.stops, ...(lastLeg.next ?? []).slice(0, upto + 1)],
        next: undefined,
      };
      const legs: Leg[] = [
        ...it.legs.slice(0, lastIdx),
        newLeg,
        {
          kind: "walk",
          from: c.name,
          fromLat: c.lat,
          fromLon: c.lon,
          to: "Destination",
          toLat: req.toLat,
          toLon: req.toLon,
          seconds: w,
          meters: Math.round(haversineMeters(c.lat, c.lon, req.toLat, req.toLon) * DETOUR_FACTOR),
        },
      ];
      const v = finalizeVariant(req, legs);
      if (v && v.totalSeconds <= it.totalSeconds + MAX_VARIANT_EXTRA) out.push(v);
    }
  }
  return out;
}
