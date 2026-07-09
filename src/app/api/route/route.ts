import { NextRequest, NextResponse } from "next/server";
import { loadTimetable } from "@/lib/timetable.server";
import { route } from "@/lib/raptor";
import { Itinerary } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { fromLat, fromLon, toLat, toLon, departTime, dayBit } = body;
  if (
    [fromLat, fromLon, toLat, toLon, departTime, dayBit].some(
      (v) => typeof v !== "number" || Number.isNaN(v)
    )
  ) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  const tt = loadTimetable();
  const started = Date.now();
  // run at several access-walk radii so results include both walk-light and
  // walk-heavy permutations (nearest station vs. farther one-seat rides)
  const seen = new Set<string>();
  const itineraries: Itinerary[] = [];
  const base = { fromLat, fromLon, toLat, toLon, departTime, dayBit };
  const collect = (found: ReturnType<typeof route>) => {
    for (const it of found) {
      if (seen.has(it.key)) continue;
      seen.add(it.key);
      itineraries.push(it);
    }
  };
  for (const mins of [10, 20, 35]) {
    collect(route(tt, { ...base, maxAccessWalkSeconds: mins * 60 }));
  }
  // rerun with the dominant routes banned so alternative lines/buses surface
  const usedRoutes = new Set<string>();
  for (let pass = 0; pass < 2; pass++) {
    for (const it of itineraries) {
      for (const l of it.legs) if (l.kind === "transit") usedRoutes.add(l.routeId);
    }
    if (usedRoutes.size === 0) break;
    collect(route(tt, { ...base, maxAccessWalkSeconds: 25 * 60, banRouteIds: [...usedRoutes] }));
  }
  return NextResponse.json({ itineraries, computeMs: Date.now() - started });
}
