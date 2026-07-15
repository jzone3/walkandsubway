export const MAX_CONCURRENT_DIRECTIONS = 4;
export const PEDESTRIAN_TIMEOUT_MS = 3500;
export const HYDRATION_DEADLINE_MS = 8000; // whole hydration stage
export const MAX_LEGS_TO_HYDRATE = 24; // unique coordinate pairs per search
export const MIN_HYDRATION_METERS = 25; // skip degenerate legs below this
export const MAX_GEOMETRY_POINTS = 300; // per-leg decimation cap
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CACHE_MAX_ENTRIES = 5000;
