export interface Coordinate {
  lat: number;
  lon: number;
}

export interface PedestrianPath {
  seconds: number;
  meters: number;
  /** Leaflet-friendly [lat, lon] order inside the app. */
  geometry: [number, number][];
  provider: string;
}

export interface PedestrianMatrix {
  durations: Array<Array<number | null>>;
  distances?: Array<Array<number | null>>;
}

export interface PedestrianRouter {
  route(from: Coordinate, to: Coordinate): Promise<PedestrianPath>;
  matrix(
    sources: Coordinate[],
    destinations: Coordinate[]
  ): Promise<PedestrianMatrix>;
}

/** Thrown by providers on HTTP 429; hydration stops issuing requests. */
export class RateLimitError extends Error {}
