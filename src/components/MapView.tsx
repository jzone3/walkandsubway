"use client";
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import { Itinerary } from "@/lib/types";

const originIcon = L.divIcon({
  className: "",
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#16a34a;border:3px solid white;box-shadow:0 0 4px rgba(0,0,0,.4)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});
const destIcon = L.divIcon({
  className: "",
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#dc2626;border:3px solid white;box-shadow:0 0 4px rgba(0,0,0,.4)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    const fit = () => {
      const size = map.getSize();
      if (size.x > 0 && size.y > 0 && points.length >= 2)
        map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    };
    fit();
    // the map container can be hidden (display:none) on mobile and later
    // revealed; Leaflet needs invalidateSize + a refit when that happens
    const obs = new ResizeObserver(() => {
      map.invalidateSize();
      fit();
    });
    obs.observe(map.getContainer());
    return () => obs.disconnect();
  }, [map, points]);
  return null;
}

export default function MapView({
  itinerary,
  origin,
  dest,
}: {
  itinerary: Itinerary | null;
  origin: { lat: number; lon: number } | null;
  dest: { lat: number; lon: number } | null;
}) {
  const allPoints = useMemo(() => {
    const pts: [number, number][] = [];
    if (origin) pts.push([origin.lat, origin.lon]);
    if (dest) pts.push([dest.lat, dest.lon]);
    if (itinerary) {
      for (const l of itinerary.legs) {
        if (l.kind === "walk") pts.push([l.fromLat, l.fromLon], [l.toLat, l.toLon]);
        else for (const s of l.stops) pts.push([s.lat, s.lon]);
      }
    }
    return pts;
  }, [itinerary, origin, dest]);

  return (
    <MapContainer
      center={[40.72, -73.95]}
      zoom={12}
      className="h-full w-full"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <FitBounds points={allPoints} />
      {origin && <Marker position={[origin.lat, origin.lon]} icon={originIcon}><Tooltip>Origin</Tooltip></Marker>}
      {dest && <Marker position={[dest.lat, dest.lon]} icon={destIcon}><Tooltip>Destination</Tooltip></Marker>}
      {itinerary?.legs.map((l, i) =>
        l.kind === "walk" ? (
          // dotted lines are for actual walking (access/egress); transfer walks
          // between stations are shown as dots on the route instead
          i === 0 || i === itinerary.legs.length - 1 ? (
            <Polyline
              key={`${itinerary.key}-${i}-walk-dotted`}
              positions={[
                [l.fromLat, l.fromLon],
                [l.toLat, l.toLon],
              ]}
              pathOptions={{ color: "#555", weight: 3, dashArray: "4 7" }}
            />
          ) : (
            <Polyline
              key={`${itinerary.key}-${i}-walk`}
              positions={[
                [l.fromLat, l.fromLon],
                [l.toLat, l.toLon],
              ]}
              pathOptions={{ color: "#555", weight: 5, opacity: 0.9 }}
            />
          )
        ) : (
          <Polyline
            key={`${itinerary.key}-${i}-transit`}
            positions={l.stops.map((s) => [s.lat, s.lon] as [number, number])}
            pathOptions={{ color: `#${l.routeColor || "555"}`, weight: 5, opacity: 0.9 }}
          />
        )
      )}
      {itinerary?.legs.flatMap((l, i) => {
        if (l.kind !== "transit") return [];
        const isFirst = itinerary.legs.slice(0, i).every((p) => p.kind !== "transit");
        const isLast = itinerary.legs.slice(i + 1).every((p) => p.kind !== "transit");
        const markers = [];
        if (isFirst)
          markers.push(
            <CircleMarker
              key={`${itinerary.key}-b${i}`}
              center={[l.stops[0].lat, l.stops[0].lon]}
              radius={5}
              pathOptions={{ color: `#${l.routeColor || "555"}`, fillColor: "white", fillOpacity: 1, weight: 2.5 }}
            >
              <Tooltip>{l.boardStop}</Tooltip>
            </CircleMarker>
          );
        else
          markers.push(
            <CircleMarker
              key={`${itinerary.key}-t${i}`}
              center={[l.stops[0].lat, l.stops[0].lon]}
              radius={6}
              pathOptions={{ color: "#18181b", fillColor: "white", fillOpacity: 1, weight: 3 }}
            >
              <Tooltip>Transfer · {l.boardStop}</Tooltip>
            </CircleMarker>
          );
        if (isLast)
          markers.push(
            <CircleMarker
              key={`${itinerary.key}-a${i}`}
              center={[l.stops[l.stops.length - 1].lat, l.stops[l.stops.length - 1].lon]}
              radius={5}
              pathOptions={{ color: `#${l.routeColor || "555"}`, fillColor: "white", fillOpacity: 1, weight: 2.5 }}
            >
              <Tooltip>{l.alightStop}</Tooltip>
            </CircleMarker>
          );
        return markers;
      })}
    </MapContainer>
  );
}
