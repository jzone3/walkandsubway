# walkmaxxing 🚶🚇

[![Built by Devin](https://raw.githubusercontent.com/club-cog/built-by-devin/main/badges/built-by-devin.svg)](https://devin.ai)

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

## Walking geometry (optional)

Walk legs can follow real streets and paths instead of straight lines, using
the [openrouteservice](https://openrouteservice.org) pedestrian router.

1. Create a free account at [account.heigit.org](https://account.heigit.org)
   and copy your API key (check your plan's daily request quota on the
   dashboard — the free tier is limited).
2. Set `ORS_API_KEY` in `.env.local` (see `.env.example`).

Without a key, everything works exactly as before: walking times are estimated
from straight-line distance and walk legs render as direct lines. Provider
outages degrade to the same fallback per leg (`routingSource: "estimate"`).
The API key stays server-side and is never sent to the browser.

---

Built by [Devin](https://devin.ai)
