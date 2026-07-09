# walkmaxxing 🚶🚇

NYC transit routing where **you** pick the walking/transfer tradeoff. Google Maps optimizes for less walking but more transfers; this app has a slider — slide right to trade subway transfers for more walking, and the top-5 routes re-rank live.

Inspired by [this tweet](https://x.com/heshie/status/2075008914970509522).

## How it works

- **Data**: MTA static GTFS (subway + all borough bus feeds) preprocessed into compact gzipped timetables in `data/` via `scripts/build-timetable.mjs`.
- **Routing**: a custom [RAPTOR](https://www.microsoft.com/en-us/research/publication/round-based-public-transit-routing/) implementation (`src/lib/raptor.ts`) — rounds = transfer count, so it naturally yields the Pareto set across (time, transfers, walk). The API runs it at multiple access-walk radii and with dominant routes banned to surface diverse permutations.
- **Slider**: the full candidate set is fetched once per A/B/time; the 0–100 walk-preference slider re-ranks client-side (`src/lib/rank.ts`) instantly — walking gets cheaper and transfers get more expensive as you slide right.
- **Real-time**: MTA subway GTFS-RT feeds (no key needed) are averaged per route into delay badges (`/api/rt`).
- **Geocoding**: Photon (OSM), NYC-biased (`/api/geocode`).
- **Map**: Leaflet, route polylines through actual station coordinates.

## Development

```bash
npm install
npm run build-data   # downloads MTA GTFS and rebuilds data/*.json.gz (optional; data is committed)
npm run dev
```

## Refreshing GTFS data

MTA publishes new schedules a few times a year (current feed valid through the date in `feed_info.txt`). Run `npm run build-data` and commit the updated `data/` files.
