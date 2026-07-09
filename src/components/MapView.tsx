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
    if (points.length >= 2) map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
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
          <Polyline
            key={i}
            positions={[
              [l.fromLat, l.fromLon],
              [l.toLat, l.toLon],
            ]}
            pathOptions={{ color: "#555", weight: 3, dashArray: "4 7" }}
          />
        ) : (
          <Polyline
            key={i}
            positions={l.stops.map((s) => [s.lat, s.lon] as [number, number])}
            pathOptions={{ color: `#${l.routeColor || "555"}`, weight: 5, opacity: 0.9 }}
          />
        )
      )}
      {itinerary?.legs.flatMap((l, i) =>
        l.kind === "transit"
          ? [
              <CircleMarker
                key={`b${i}`}
                center={[l.stops[0].lat, l.stops[0].lon]}
                radius={5}
                pathOptions={{ color: `#${l.routeColor || "555"}`, fillColor: "white", fillOpacity: 1, weight: 2.5 }}
              >
                <Tooltip>{l.boardStop}</Tooltip>
              </CircleMarker>,
              <CircleMarker
                key={`a${i}`}
                center={[l.stops[l.stops.length - 1].lat, l.stops[l.stops.length - 1].lon]}
                radius={5}
                pathOptions={{ color: `#${l.routeColor || "555"}`, fillColor: "white", fillOpacity: 1, weight: 2.5 }}
              >
                <Tooltip>{l.alightStop}</Tooltip>
              </CircleMarker>,
            ]
          : []
      )}
    </MapContainer>
  );
}
