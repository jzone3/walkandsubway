import "server-only";
import {
  Coordinate,
  PedestrianMatrix,
  PedestrianPath,
  PedestrianRouter,
  RateLimitError,
} from "./types";
import { PEDESTRIAN_TIMEOUT_MS } from "./constants";
import {
  isValidCoordinate,
  normalizeDirectionsResponse,
  toOrsCoordinates,
} from "./normalize";

export const ORS_PROVIDER = "openrouteservice";

export class OpenRouteServiceRouter implements PedestrianRouter {
  constructor(
    private apiKey: string,
    private baseUrl: string,
    private fetchFn: typeof fetch = fetch
  ) {}

  async route(from: Coordinate, to: Coordinate): Promise<PedestrianPath> {
    if (!isValidCoordinate(from) || !isValidCoordinate(to)) {
      throw new Error("invalid coordinates");
    }
    const res = await this.fetchFn(
      `${this.baseUrl}/v2/directions/foot-walking/geojson`,
      {
        method: "POST",
        headers: {
          Authorization: this.apiKey,
          "Content-Type": "application/json",
          Accept: "application/geo+json",
        },
        body: JSON.stringify({
          coordinates: toOrsCoordinates(from, to),
          instructions: false,
        }),
        signal: AbortSignal.timeout(PEDESTRIAN_TIMEOUT_MS),
      }
    );
    if (res.status === 429) throw new RateLimitError("openrouteservice rate limited");
    if (!res.ok) throw new Error(`openrouteservice ${res.status}`);
    const normalized = normalizeDirectionsResponse(await res.json());
    return { ...normalized, provider: ORS_PROVIDER };
  }

  async matrix(
    _sources: Coordinate[],
    _destinations: Coordinate[]
  ): Promise<PedestrianMatrix> {
    void _sources;
    void _destinations;
    throw new Error("matrix() is not implemented in PR 1");
  }
}

export function getPedestrianRouter(): PedestrianRouter | null {
  const key = process.env.ORS_API_KEY;
  if (!key) return null;
  return new OpenRouteServiceRouter(
    key,
    process.env.ORS_BASE_URL ?? "https://api.openrouteservice.org"
  );
}
