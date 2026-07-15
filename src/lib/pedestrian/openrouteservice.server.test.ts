import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ORS_PROVIDER,
  OpenRouteServiceRouter,
  getPedestrianRouter,
} from "./openrouteservice.server";
import { RateLimitError } from "./types";
import { MalformedResponseError } from "./normalize";

const FROM = { lat: 40.758, lon: -73.9855 };
const TO = { lat: 40.7681, lon: -73.9819 };

function okResponse() {
  return new Response(
    JSON.stringify({
      features: [
        {
          geometry: {
            coordinates: [
              [-73.9855, 40.758],
              [-73.984, 40.762],
              [-73.9819, 40.7681],
            ],
          },
          properties: { summary: { duration: 600.4, distance: 812.6 } },
        },
      ],
    }),
    { status: 200 }
  );
}

describe("OpenRouteServiceRouter.route", () => {
  it("POSTs to the foot-walking geojson endpoint with required headers and [lon,lat] body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());
    const router = new OpenRouteServiceRouter("test-key", "https://ors.example", fetchFn);
    await router.route(FROM, TO);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://ors.example/v2/directions/foot-walking/geojson");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "test-key",
      "Content-Type": "application/json",
      Accept: "application/geo+json",
    });
    expect(JSON.parse(init.body)).toEqual({
      coordinates: [
        [-73.9855, 40.758],
        [-73.9819, 40.7681],
      ],
      instructions: false,
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns a normalized PedestrianPath tagged with the provider", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());
    const router = new OpenRouteServiceRouter("k", "https://ors.example", fetchFn);
    const path = await router.route(FROM, TO);
    expect(path.provider).toBe(ORS_PROVIDER);
    expect(path.seconds).toBe(600);
    expect(path.meters).toBe(813);
    expect(path.geometry[0]).toEqual([40.758, -73.9855]);
  });

  it("throws RateLimitError on 429", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("", { status: 429 }));
    const router = new OpenRouteServiceRouter("k", "https://ors.example", fetchFn);
    await expect(router.route(FROM, TO)).rejects.toBeInstanceOf(RateLimitError);
  });

  it("throws a plain error on other non-OK statuses", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("", { status: 500 }));
    const router = new OpenRouteServiceRouter("k", "https://ors.example", fetchFn);
    await expect(router.route(FROM, TO)).rejects.toThrow("openrouteservice 500");
  });

  it("propagates MalformedResponseError on unexpected response shapes", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const router = new OpenRouteServiceRouter("k", "https://ors.example", fetchFn);
    await expect(router.route(FROM, TO)).rejects.toBeInstanceOf(MalformedResponseError);
  });

  it("rejects invalid coordinates without calling fetch", async () => {
    const fetchFn = vi.fn();
    const router = new OpenRouteServiceRouter("k", "https://ors.example", fetchFn);
    await expect(router.route({ lat: 91, lon: 0 }, TO)).rejects.toThrow(
      "invalid coordinates"
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("OpenRouteServiceRouter.matrix", () => {
  it("throws not-implemented in PR 1", async () => {
    const router = new OpenRouteServiceRouter("k", "https://ors.example", vi.fn());
    await expect(router.matrix([FROM], [TO])).rejects.toThrow(
      "matrix() is not implemented in PR 1"
    );
  });
});

describe("getPedestrianRouter", () => {
  afterEach(() => {
    delete process.env.ORS_API_KEY;
    delete process.env.ORS_BASE_URL;
  });

  it("returns null when ORS_API_KEY is unset", () => {
    delete process.env.ORS_API_KEY;
    expect(getPedestrianRouter()).toBeNull();
  });

  it("returns a router when ORS_API_KEY is set", () => {
    process.env.ORS_API_KEY = "k";
    expect(getPedestrianRouter()).toBeInstanceOf(OpenRouteServiceRouter);
  });
});
