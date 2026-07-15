import { describe, expect, it } from "vitest";
import {
  MalformedResponseError,
  decimateGeometry,
  isValidCoordinate,
  normalizeDirectionsResponse,
  toOrsCoordinates,
} from "./normalize";

function orsResponse(
  coords: number[][],
  summary: { duration: number; distance: number } = {
    duration: 600.4,
    distance: 812.6,
  }
) {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: { summary },
      },
    ],
  };
}

describe("isValidCoordinate", () => {
  it("accepts NYC coordinates", () => {
    expect(isValidCoordinate({ lat: 40.758, lon: -73.9855 })).toBe(true);
  });
  it("rejects out-of-range and non-finite values", () => {
    expect(isValidCoordinate({ lat: 91, lon: 0 })).toBe(false);
    expect(isValidCoordinate({ lat: 0, lon: -181 })).toBe(false);
    expect(isValidCoordinate({ lat: NaN, lon: 0 })).toBe(false);
    expect(isValidCoordinate({ lat: 0, lon: Infinity })).toBe(false);
  });
});

describe("toOrsCoordinates", () => {
  it("flips {lat, lon} to [lon, lat] pairs", () => {
    expect(
      toOrsCoordinates({ lat: 40.758, lon: -73.9855 }, { lat: 40.7681, lon: -73.9819 })
    ).toEqual([
      [-73.9855, 40.758],
      [-73.9819, 40.7681],
    ]);
  });
});

describe("normalizeDirectionsResponse", () => {
  it("flips geometry to [lat, lon] and rounds duration/distance", () => {
    const out = normalizeDirectionsResponse(
      orsResponse([
        [-73.9855, 40.758],
        [-73.984, 40.762],
        [-73.9819, 40.7681],
      ])
    );
    expect(out.geometry).toEqual([
      [40.758, -73.9855],
      [40.762, -73.984],
      [40.7681, -73.9819],
    ]);
    expect(out.seconds).toBe(600);
    expect(out.meters).toBe(813);
  });

  it("throws MalformedResponseError on missing features, short geometry, or bad summary", () => {
    expect(() => normalizeDirectionsResponse({})).toThrow(MalformedResponseError);
    expect(() => normalizeDirectionsResponse({ features: [] })).toThrow(
      MalformedResponseError
    );
    expect(() =>
      normalizeDirectionsResponse(orsResponse([[-73.9855, 40.758]]))
    ).toThrow(MalformedResponseError);
    expect(() =>
      normalizeDirectionsResponse({
        features: [
          {
            geometry: { coordinates: [[-73.9, 40.7], [-73.8, 40.8]] },
            properties: { summary: { duration: "x", distance: 5 } },
          },
        ],
      })
    ).toThrow(MalformedResponseError);
    expect(() =>
      normalizeDirectionsResponse(orsResponse([[-73.9, 40.7], ["bad", 40.8] as unknown as number[]]))
    ).toThrow(MalformedResponseError);
  });

  it("decimates oversized geometry to MAX_GEOMETRY_POINTS keeping endpoints", () => {
    const coords = Array.from({ length: 1000 }, (_, i) => [-74 + i * 1e-4, 40 + i * 1e-4]);
    const out = normalizeDirectionsResponse(orsResponse(coords));
    expect(out.geometry.length).toBe(300);
    expect(out.geometry[0]).toEqual([40, -74]);
    expect(out.geometry[299]).toEqual([40 + 999 * 1e-4, -74 + 999 * 1e-4]);
  });
});

describe("decimateGeometry", () => {
  it("returns short inputs unchanged", () => {
    const pts: [number, number][] = [
      [40, -74],
      [41, -73],
    ];
    expect(decimateGeometry(pts, 300)).toBe(pts);
  });
});
