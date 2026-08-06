import { Place } from "@/components/LocationInput";

export type SearchState = {
  origin: Place | null;
  dest: Place | null;
  slider: number;
  maxTransfers: number;
  avoidLines: Set<string>;
};

export function parsePlaceParam(v: string | null): Place | null {
  if (!v) return null;
  const [label, lat, lon] = v.split("|");
  return label && isFinite(+lat) && isFinite(+lon) ? { label, lat: +lat, lon: +lon } : null;
}

function formatPlaceParam(p: Place): string {
  return `${p.label}|${p.lat.toFixed(5)}|${p.lon.toFixed(5)}`;
}

export function buildSearchParams(s: SearchState): URLSearchParams {
  const q = new URLSearchParams();
  if (s.origin) q.set("from", formatPlaceParam(s.origin));
  if (s.dest) q.set("to", formatPlaceParam(s.dest));
  if (s.slider !== 50) q.set("s", String(s.slider));
  if (s.maxTransfers >= 0) q.set("xfer", String(s.maxTransfers));
  if (s.avoidLines.size > 0) q.set("avoid", [...s.avoidLines].join(","));
  return q;
}
