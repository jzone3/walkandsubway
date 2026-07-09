import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { Timetable } from "./types";
import { haversineMeters, walkSeconds } from "./geo";

let cached: Timetable | null = null;

const FOOTPATH_MAX_METERS = 200;

// connect stops within walking distance (bus<->bus and bus<->subway transfers)
function addFootpaths(tt: Timetable) {
  const existing = new Set(tt.transfers.map(([a, b]) => a + "_" + b));
  const cell = 0.003; // ~300m grid
  const grid = new Map<string, number[]>();
  tt.stops.forEach((s, i) => {
    const key = Math.floor(s.lat / cell) + "," + Math.floor(s.lon / cell);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(i);
  });
  tt.stops.forEach((s, i) => {
    const cx = Math.floor(s.lat / cell);
    const cy = Math.floor(s.lon / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of grid.get(cx + dx + "," + (cy + dy)) ?? []) {
          if (i === j) continue;
          const t = tt.stops[j];
          const d = haversineMeters(s.lat, s.lon, t.lat, t.lon);
          if (d > FOOTPATH_MAX_METERS) continue;
          if (existing.has(i + "_" + j)) continue;
          tt.transfers.push([i, j, Math.max(60, walkSeconds(d))]);
        }
      }
    }
  });
}

export function loadTimetable(): Timetable {
  if (cached) return cached;
  const dir = path.join(process.cwd(), "data");
  const files = fs.readdirSync(dir).filter((f) => f.startsWith("timetable-") && f.endsWith(".json.gz"));
  if (files.length === 0) throw new Error("no timetable data found in data/");
  const merged: Timetable = { stops: [], routes: [], services: [], patterns: [], transfers: [] };
  for (const f of files) {
    const tt: Timetable = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, f))).toString("utf8"));
    const stopOff = merged.stops.length;
    const routeOff = merged.routes.length;
    const svcOff = merged.services.length;
    merged.stops.push(...tt.stops);
    merged.routes.push(...tt.routes);
    merged.services.push(...tt.services);
    for (const p of tt.patterns) {
      merged.patterns.push({
        route: p.route + routeOff,
        stops: p.stops.map((s) => s + stopOff),
        trips: p.trips.map((t) => ({ ...t, svc: t.svc + svcOff })),
      });
    }
    for (const [a, b, s] of tt.transfers) merged.transfers.push([a + stopOff, b + stopOff, s]);
  }
  addFootpaths(merged);
  cached = merged;
  return merged;
}
