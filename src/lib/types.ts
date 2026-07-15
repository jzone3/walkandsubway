export interface Stop {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface Route {
  id: string;
  name: string;
  longName: string;
  color: string;
  type: number; // 1 = subway, 3 = bus
}

export interface Trip {
  svc: number;
  arr: number[];
  dep: number[];
}

export interface Pattern {
  route: number;
  stops: number[];
  trips: Trip[];
}

export interface Timetable {
  stops: Stop[];
  routes: Route[];
  services: number[]; // 7-bit day masks, bit 0 = monday
  patterns: Pattern[];
  transfers: [number, number, number][];
}

export interface WalkLeg {
  kind: "walk";
  from: string;
  fromLat: number;
  fromLon: number;
  to: string;
  toLat: number;
  toLon: number;
  seconds: number;
  meters: number;
  /** Routed path in Leaflet [lat, lon] order; absent when estimated. */
  geometry?: [number, number][];
  routingSource?: "openrouteservice" | "estimate";
}

export interface TransitLeg {
  kind: "transit";
  routeId: string;
  routeName: string;
  routeColor: string;
  routeType: number;
  headsign: string;
  boardStop: string;
  alightStop: string;
  boardTime: number;
  alightTime: number;
  stops: { name: string; lat: number; lon: number; arr: number; dep: number }[];
  // stops the trip continues to after the alight stop (for overshoot variants);
  // stripped before responses
  next?: { name: string; lat: number; lon: number; arr: number; dep: number }[];
  // seconds until the next trip on this line from the board stop
  headwaySecs?: number;
  delaySeconds?: number;
}

export type Leg = WalkLeg | TransitLeg;

export interface Itinerary {
  departTime: number;
  arriveTime: number;
  totalSeconds: number;
  walkSeconds: number;
  waitSeconds: number;
  rideSeconds: number;
  transfers: number;
  legs: Leg[];
  key: string;
}
