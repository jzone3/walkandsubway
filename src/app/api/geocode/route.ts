import { NextRequest, NextResponse } from "next/server";

// NYC bounding box
const BBOX = { minLon: -74.30, minLat: 40.45, maxLon: -73.65, maxLat: 40.95 };

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ results: [] });
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "6");
  url.searchParams.set("lat", "40.72");
  url.searchParams.set("lon", "-73.95");
  url.searchParams.set("bbox", `${BBOX.minLon},${BBOX.minLat},${BBOX.maxLon},${BBOX.maxLat}`);
  const res = await fetch(url, { headers: { "User-Agent": "walkmaxxing" } });
  if (!res.ok) return NextResponse.json({ results: [] });
  const data = await res.json();
  interface PhotonFeature {
    geometry: { coordinates: [number, number] };
    properties: {
      name?: string;
      housenumber?: string;
      street?: string;
      city?: string;
      district?: string;
      postcode?: string;
      state?: string;
    };
  }
  const results = ((data.features ?? []) as PhotonFeature[])
    .filter((f) => {
      const [lon, lat] = f.geometry.coordinates;
      return lon >= BBOX.minLon && lon <= BBOX.maxLon && lat >= BBOX.minLat && lat <= BBOX.maxLat;
    })
    .map((f) => {
      const p = f.properties;
      const address = [p.housenumber, p.street].filter(Boolean).join(" ");
      const parts = [
        p.name ?? address,
        p.district && p.district !== p.name ? p.district : p.city,
        p.state,
      ].filter(Boolean);
      const sublabel =
        p.name && address
          ? [address, p.district && p.district !== p.name ? p.district : p.city]
              .filter(Boolean)
              .join(", ")
          : undefined;
      return {
        label: parts.join(", "),
        sublabel,
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
      };
    });
  return NextResponse.json({ results });
}
