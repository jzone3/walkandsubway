import { NextResponse } from "next/server";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";

// MTA subway GTFS-RT feeds (free, no API key required)
const FEEDS = ["", "-ace", "-bdfm", "-g", "-jz", "-nqrw", "-l", "-si"].map(
  (s) => `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs${s}`
);

export const dynamic = "force-dynamic";
export const revalidate = 0;

let cache: { at: number; delays: Record<string, number> } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.at < 60_000) {
    return NextResponse.json({ routeDelays: cache.delays, cachedAt: cache.at });
  }
  const delays: Record<string, { sum: number; n: number }> = {};
  await Promise.allSettled(
    FEEDS.map(async (url) => {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const buf = new Uint8Array(await res.arrayBuffer());
      const msg = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buf);
      for (const ent of msg.entity) {
        const tu = ent.tripUpdate;
        if (!tu?.trip?.routeId) continue;
        const routeId = `subway:${tu.trip.routeId}`;
        for (const stu of tu.stopTimeUpdate ?? []) {
          const d = stu.arrival?.delay ?? stu.departure?.delay;
          if (typeof d === "number") {
            delays[routeId] ??= { sum: 0, n: 0 };
            delays[routeId].sum += d;
            delays[routeId].n += 1;
          }
        }
      }
    })
  );
  const routeDelays: Record<string, number> = {};
  for (const [k, v] of Object.entries(delays)) {
    if (v.n > 0) routeDelays[k] = Math.round(v.sum / v.n);
  }
  cache = { at: Date.now(), delays: routeDelays };
  return NextResponse.json({ routeDelays, cachedAt: cache.at });
}
