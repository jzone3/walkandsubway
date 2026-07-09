export const WALK_SPEED_MPS = 1.33; // ~3 mph
export const DETOUR_FACTOR = 1.3; // straight-line -> street distance

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function walkSeconds(meters: number): number {
  return Math.round((meters * DETOUR_FACTOR) / WALK_SPEED_MPS);
}
