import { Coordinate } from "./types";

export class LruCache<V> {
  private map = new Map<string, { value: V; expires: number }>();

  constructor(
    private maxEntries: number,
    private ttlMs: number,
    private now: () => number = Date.now
  ) {}

  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    // Map iteration order is insertion order; re-insert to mark as recent
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, { value, expires: this.now() + this.ttlMs });
    if (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  get size(): number {
    return this.map.size;
  }
}

export function walkPairKey(
  from: Coordinate,
  to: Coordinate,
  provider: string
): string {
  return [
    from.lat.toFixed(5),
    from.lon.toFixed(5),
    to.lat.toFixed(5),
    to.lon.toFixed(5),
    provider,
  ].join(":");
}
