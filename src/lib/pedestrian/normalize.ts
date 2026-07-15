import { Coordinate } from "./types";
import { MAX_GEOMETRY_POINTS } from "./constants";

export class MalformedResponseError extends Error {}

interface OrsDirectionsResponse {
  features?: Array<{
    geometry?: { coordinates?: unknown };
    properties?: { summary?: { duration?: unknown; distance?: unknown } };
  }>;
}

export function isValidCoordinate(c: Coordinate): boolean {
  return (
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lon) &&
    c.lat >= -90 &&
    c.lat <= 90 &&
    c.lon >= -180 &&
    c.lon <= 180
  );
}

/** ORS wire format is [longitude, latitude]. This is the only place we flip. */
export function toOrsCoordinates(
  from: Coordinate,
  to: Coordinate
): [number, number][] {
  return [
    [from.lon, from.lat],
    [to.lon, to.lat],
  ];
}

/** Evenly sample down to max points, always keeping the first and last. */
export function decimateGeometry(
  points: [number, number][],
  max: number = MAX_GEOMETRY_POINTS
): [number, number][] {
  if (points.length <= max) return points;
  const out: [number, number][] = [points[0]];
  const step = (points.length - 1) / (max - 1);
  for (let i = 1; i < max - 1; i++) out.push(points[Math.round(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

export function normalizeDirectionsResponse(json: unknown): {
  seconds: number;
  meters: number;
  geometry: [number, number][];
} {
  const feature = (json as OrsDirectionsResponse)?.features?.[0];
  const coords = feature?.geometry?.coordinates;
  const summary = feature?.properties?.summary;
  if (
    !Array.isArray(coords) ||
    coords.length < 2 ||
    typeof summary?.duration !== "number" ||
    typeof summary?.distance !== "number"
  ) {
    throw new MalformedResponseError("unexpected openrouteservice response shape");
  }
  const geometry: [number, number][] = [];
  for (const pair of coords) {
    if (
      !Array.isArray(pair) ||
      typeof pair[0] !== "number" ||
      typeof pair[1] !== "number"
    ) {
      throw new MalformedResponseError("bad coordinate in response geometry");
    }
    geometry.push([pair[1], pair[0]]); // [lon, lat] -> [lat, lon]
  }
  return {
    seconds: Math.round(summary.duration),
    meters: Math.round(summary.distance),
    geometry: decimateGeometry(geometry),
  };
}
