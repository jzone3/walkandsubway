import { describe, expect, it } from "vitest";
import {
  CACHE_MAX_ENTRIES,
  CACHE_TTL_MS,
  HYDRATION_DEADLINE_MS,
  MAX_CONCURRENT_DIRECTIONS,
  MAX_GEOMETRY_POINTS,
  MAX_LEGS_TO_HYDRATE,
  MIN_HYDRATION_METERS,
  PEDESTRIAN_TIMEOUT_MS,
} from "./constants";

describe("pedestrian constants", () => {
  it("match the spec values", () => {
    expect(MAX_CONCURRENT_DIRECTIONS).toBe(4);
    expect(PEDESTRIAN_TIMEOUT_MS).toBe(3500);
    expect(HYDRATION_DEADLINE_MS).toBe(8000);
    expect(MAX_LEGS_TO_HYDRATE).toBe(24);
    expect(MIN_HYDRATION_METERS).toBe(25);
    expect(MAX_GEOMETRY_POINTS).toBe(300);
    expect(CACHE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(CACHE_MAX_ENTRIES).toBe(5000);
  });
});
