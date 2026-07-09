#!/usr/bin/env bash
# Download MTA GTFS feeds and rebuild the compact timetables in data/.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "downloading subway feed..."
curl -sL -o "$tmp/subway.zip" "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip"
mkdir -p "$tmp/subway" && unzip -oq -d "$tmp/subway" "$tmp/subway.zip"

for b in m b bx q si busco; do
  echo "downloading bus feed $b..."
  curl -sL -o "$tmp/bus_$b.zip" "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_$b.zip"
  mkdir -p "$tmp/bus_$b" && unzip -oq -d "$tmp/bus_$b" "$tmp/bus_$b.zip"
done

node scripts/build-timetable.mjs data/timetable-subway.json.gz "$tmp/subway"
node --max-old-space-size=8192 scripts/build-timetable.mjs data/timetable-bus.json.gz \
  "$tmp/bus_m" "$tmp/bus_b" "$tmp/bus_bx" "$tmp/bus_q" "$tmp/bus_si" "$tmp/bus_busco"
