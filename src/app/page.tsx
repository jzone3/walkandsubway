"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import LocationInput, { Place } from "@/components/LocationInput";
import ItineraryCard from "@/components/ItineraryCard";
import { Itinerary } from "@/lib/types";
import { rankItineraries } from "@/lib/rank";
import { nowInNY, dayBitFromDateStr, secondsFromTimeStr } from "@/lib/time";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function Home() {
  const [origin, setOrigin] = useState<Place | null>(null);
  const [dest, setDest] = useState<Place | null>(null);
  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("");
  const [slider, setSlider] = useState(50);
  const [itins, setItins] = useState<Itinerary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [delays, setDelays] = useState<Record<string, number>>({});

  useEffect(() => {
    const now = nowInNY();
    setDateStr(now.dateStr);
    setTimeStr(now.timeStr);
  }, []);

  useEffect(() => {
    fetch("/api/rt")
      .then((r) => r.json())
      .then((d) => setDelays(d.routeDelays ?? {}))
      .catch(() => {});
  }, []);

  const go = useCallback(async () => {
    if (!origin || !dest || !dateStr || !timeStr) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromLat: origin.lat,
          fromLon: origin.lon,
          toLat: dest.lat,
          toLon: dest.lon,
          departTime: secondsFromTimeStr(timeStr),
          dayBit: dayBitFromDateStr(dateStr),
        }),
      });
      if (!res.ok) throw new Error(`routing failed (${res.status})`);
      const data = await res.json();
      setItins(data.itineraries);
      setSelectedKey(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "something went wrong");
    } finally {
      setLoading(false);
    }
  }, [origin, dest, dateStr, timeStr]);

  useEffect(() => {
    if (origin && dest) void go();
  }, [origin, dest, go]);

  const ranked = useMemo(() => (itins ? rankItineraries(itins, slider, 5) : null), [itins, slider]);
  const selected = useMemo(() => {
    if (!ranked || ranked.length === 0) return null;
    return ranked.find((i) => i.key === selectedKey) ?? ranked[0];
  }, [ranked, selectedKey]);

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <div className="flex w-full flex-col gap-3 overflow-y-auto border-r border-zinc-200 bg-zinc-50 p-4 md:w-[440px] md:shrink-0">
        <header>
          <h1 className="text-xl font-bold tracking-tight">walkmaxxing 🚶🚇</h1>
          <p className="text-xs text-zinc-500">
            NYC transit routing where <em>you</em> pick the walking/transfer tradeoff
          </p>
        </header>

        <div className="flex flex-col gap-2">
          <LocationInput placeholder="From (e.g. home address)" value={origin} onSelect={setOrigin} />
          <LocationInput placeholder="To (e.g. office address)" value={dest} onSelect={setDest} />
          <div className="flex gap-2">
            <input
              type="date"
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
            />
            <input
              type="time"
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
            />
            <button
              onClick={go}
              disabled={!origin || !dest || loading}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {loading ? "…" : "Go"}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-3">
          <div className="mb-1 flex items-center justify-between text-xs font-medium text-zinc-600">
            <span>fewest steps</span>
            <span className="text-sm font-bold text-zinc-900">walk preference: {slider}</span>
            <span>walkmaxx</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={slider}
            onChange={(e) => setSlider(+e.target.value)}
            className="w-full accent-zinc-900"
          />
          <p className="mt-1 text-[11px] text-zinc-400">
            Slide right to trade subway transfers for more walking — results re-rank live.
          </p>
        </div>

        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {ranked && ranked.length === 0 && (
          <div className="text-sm text-zinc-500">No routes found — try different points.</div>
        )}

        {ranked?.map((it, i) => (
          <ItineraryCard
            key={it.key}
            it={it}
            rank={i + 1}
            selected={selected?.key === it.key}
            delays={delays}
            onClick={() => setSelectedKey(it.key)}
          />
        ))}

        {!itins && !loading && (
          <div className="mt-4 text-center text-sm text-zinc-400">
            Enter two NYC locations to see your options.
          </div>
        )}

        <footer className="mt-auto pt-4 text-center text-xs text-zinc-400">
          Built by{" "}
          <a href="https://devin.ai" className="underline hover:text-zinc-600" target="_blank" rel="noopener noreferrer">
            Devin
          </a>
        </footer>
      </div>

      <div className="min-h-[40dvh] flex-1">
        <MapView itinerary={selected} origin={origin} dest={dest} />
      </div>
    </div>
  );
}
