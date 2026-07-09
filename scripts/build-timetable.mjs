#!/usr/bin/env node
// Preprocess GTFS feeds into a compact timetable JSON used by the RAPTOR router.
// Usage: node scripts/build-timetable.mjs <out.json> <feedDir> [feedDir...]
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

function readTable(dir, name) {
  const p = path.join(dir, name);
  if (!fs.existsSync(p)) return [];
  const rows = parseCSV(fs.readFileSync(p, "utf8"));
  const header = rows[0];
  return rows.slice(1).filter((r) => r.length > 1).map((r) => {
    const o = {};
    header.forEach((h, i) => (o[h.trim()] = r[i] ?? ""));
    return o;
  });
}

function hms(t) {
  if (!t) return -1;
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

const [outPath, ...feedDirs] = process.argv.slice(2);
if (!outPath || feedDirs.length === 0) {
  console.error("usage: build-timetable.mjs <out.json.gz> <feedDir> [feedDir...]");
  process.exit(1);
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const stops = []; // {id,name,lat,lon}
const stopIdx = new Map(); // globalId -> index
const routes = []; // {id,name,longName,color,type}
const routeIdx = new Map();
const services = []; // 7-bit masks (bit 0 = monday)
const serviceIdx = new Map(); // mask -> index
const patterns = []; // {route, stops:[stopIdx], trips:[{svc, dep:[...], arr:[...]}]}
const transfers = []; // [from, to, seconds]

for (const dir of feedDirs) {
  const feedTag = path.basename(dir);
  const gid = (id) => `${feedTag}:${id}`;

  const cal = readTable(dir, "calendar.txt");
  const svcMask = new Map();
  for (const c of cal) {
    let mask = 0;
    DAYS.forEach((d, i) => { if (c[d] === "1") mask |= 1 << i; });
    svcMask.set(c.service_id, mask);
  }
  // calendar_dates-only feeds: derive masks from exception dates
  const calDates = readTable(dir, "calendar_dates.txt");
  for (const cd of calDates) {
    if (cd.exception_type !== "1" || svcMask.has(cd.service_id)) continue;
    const d = cd.date;
    const dt = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T12:00:00`);
    const jsDay = dt.getDay(); // 0=Sun
    const bit = jsDay === 0 ? 6 : jsDay - 1;
    svcMask.set(cd.service_id, (svcMask.get(cd.service_id) || 0) | (1 << bit));
  }
  const svcToIdx = new Map();
  for (const [sid, mask] of svcMask) {
    if (!serviceIdx.has(mask)) { serviceIdx.set(mask, services.length); services.push(mask); }
    svcToIdx.set(sid, serviceIdx.get(mask));
  }

  const stopRows = readTable(dir, "stops.txt");
  const parentOf = new Map();
  for (const s of stopRows) {
    if (s.location_type === "1") continue; // parent stations are not routing nodes
    if (s.parent_station) parentOf.set(s.stop_id, s.parent_station);
    stopIdx.set(gid(s.stop_id), stops.length);
    stops.push({ id: gid(s.stop_id), name: s.stop_name, lat: +s.stop_lat, lon: +s.stop_lon });
  }

  for (const r of readTable(dir, "routes.txt")) {
    routeIdx.set(gid(r.route_id), routes.length);
    routes.push({
      id: gid(r.route_id),
      name: r.route_short_name || r.route_id,
      longName: r.route_long_name || "",
      color: r.route_color || "888888",
      type: +r.route_type || 3,
    });
  }

  const tripInfo = new Map(); // trip_id -> {route, svc}
  for (const t of readTable(dir, "trips.txt")) {
    const svc = svcToIdx.get(t.service_id);
    const route = routeIdx.get(gid(t.route_id));
    if (svc === undefined || route === undefined) continue;
    tripInfo.set(t.trip_id, { route, svc });
  }

  // group stop_times by trip (file is sorted by trip; stream parse for memory)
  const st = readTable(dir, "stop_times.txt");
  st.sort((a, b) => (a.trip_id < b.trip_id ? -1 : a.trip_id > b.trip_id ? 1 : +a.stop_sequence - +b.stop_sequence));
  const patIdx = new Map(); // key -> pattern index
  let cur = null, curTrip = null;
  const flush = () => {
    if (!cur || cur.length < 2) { cur = null; return; }
    const info = tripInfo.get(curTrip);
    if (!info) { cur = null; return; }
    const stopSeq = cur.map((x) => x.s);
    const key = info.route + "|" + stopSeq.join(",");
    let pi = patIdx.get(key);
    if (pi === undefined) {
      pi = patterns.length;
      patIdx.set(key, pi);
      patterns.push({ route: info.route, stops: stopSeq, trips: [] });
    }
    patterns[pi].trips.push({ svc: info.svc, arr: cur.map((x) => x.a), dep: cur.map((x) => x.d) });
    cur = null;
  };
  for (const row of st) {
    if (row.trip_id !== curTrip) { flush(); curTrip = row.trip_id; cur = []; }
    const si = stopIdx.get(gid(row.stop_id));
    if (si === undefined) continue;
    const a = hms(row.arrival_time), d = hms(row.departure_time);
    if (a < 0 && d < 0) continue;
    cur.push({ s: si, a: a < 0 ? d : a, d: d < 0 ? a : d });
  }
  flush();

  // transfers: expand parent-station pairs to all child stop pairs
  const children = new Map(); // parent -> [child stop ids]
  for (const [child, parent] of parentOf) {
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(child);
  }
  const expand = (id) => (children.has(id) ? children.get(id) : [id]);
  const seen = new Set();
  for (const t of readTable(dir, "transfers.txt")) {
    const secs = +t.min_transfer_time || 180;
    for (const a of expand(t.from_stop_id)) {
      for (const b of expand(t.to_stop_id)) {
        if (a === b) continue;
        const ka = gid(a), kb = gid(b);
        const ia = stopIdx.get(ka), ib = stopIdx.get(kb);
        if (ia === undefined || ib === undefined) continue;
        const key = ia + "_" + ib;
        if (seen.has(key)) continue;
        seen.add(key);
        transfers.push([ia, ib, secs]);
      }
    }
  }
  // implicit same-parent transfers when not in transfers.txt
  for (const [, kids] of children) {
    for (const a of kids) for (const b of kids) {
      if (a === b) continue;
      const ia = stopIdx.get(gid(a)), ib = stopIdx.get(gid(b));
      if (ia === undefined || ib === undefined) continue;
      const key = ia + "_" + ib;
      if (seen.has(key)) continue;
      seen.add(key);
      transfers.push([ia, ib, 180]);
    }
  }
  console.log(`${feedTag}: ${stopRows.length} stops, ${patterns.length} patterns so far`);
}

// sort trips within each pattern by departure at first stop (RAPTOR requirement)
for (const p of patterns) p.trips.sort((a, b) => a.dep[0] - b.dep[0]);

const out = { stops, routes, services, patterns, transfers };
const json = JSON.stringify(out);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
if (outPath.endsWith(".gz")) fs.writeFileSync(outPath, zlib.gzipSync(json, { level: 9 }));
else fs.writeFileSync(outPath, json);
console.log(
  `wrote ${outPath}: ${stops.length} stops, ${routes.length} routes, ${patterns.length} patterns, ${patterns.reduce((n, p) => n + p.trips.length, 0)} trips, ${transfers.length} transfers, ${(json.length / 1e6).toFixed(1)}MB raw`
);
