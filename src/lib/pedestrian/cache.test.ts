import { describe, expect, it } from "vitest";
import { LruCache, walkPairKey } from "./cache";

describe("walkPairKey", () => {
  it("uses 5-decimal precision and includes the provider", () => {
    const key = walkPairKey(
      { lat: 40.758012345, lon: -73.985598765 },
      { lat: 40.7681, lon: -73.9819 },
      "openrouteservice"
    );
    expect(key).toBe("40.75801:-73.98560:40.76810:-73.98190:openrouteservice");
  });

  it("differs for different providers", () => {
    const a = { lat: 40.1, lon: -73.1 };
    const b = { lat: 40.2, lon: -73.2 };
    expect(walkPairKey(a, b, "openrouteservice")).not.toBe(
      walkPairKey(a, b, "other")
    );
  });
});

describe("LruCache", () => {
  it("returns undefined on miss and the value on hit", () => {
    const cache = new LruCache<string>(2, 1000);
    expect(cache.get("a")).toBeUndefined();
    cache.set("a", "va");
    expect(cache.get("a")).toBe("va");
  });

  it("evicts the least recently used entry at capacity", () => {
    const cache = new LruCache<string>(2, 1000);
    cache.set("a", "va");
    cache.set("b", "vb");
    cache.get("a"); // refresh a's recency
    cache.set("c", "vc"); // evicts b, not a
    expect(cache.get("a")).toBe("va");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe("vc");
    expect(cache.size).toBe(2);
  });

  it("expires entries after the TTL", () => {
    let clock = 0;
    const cache = new LruCache<string>(10, 1000, () => clock);
    cache.set("a", "va");
    clock = 999;
    expect(cache.get("a")).toBe("va");
    clock = 1000;
    expect(cache.get("a")).toBeUndefined();
  });
});
