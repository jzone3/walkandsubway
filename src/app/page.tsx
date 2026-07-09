"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maxTransfers, setMaxTransfers] = useState(-1); // -1 = no limit
  const [itins, setItins] = useState<Itinerary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [sliderTouched, setSliderTouched] = useState(false);
  const [delays, setDelays] = useState<Record<string, number>>({});
  const [mobileView, setMobileView] = useState<"list" | "map">("list");

  useEffect(() => {
    const now = nowInNY();
    setDateStr(now.dateStr);
    setTimeStr(now.timeStr);
    try {
      const saved = localStorage.getItem("walkmaxxing:lastSearch");
      if (saved) {
        const s = JSON.parse(saved);
        if (s.origin) setOrigin(s.origin);
        if (s.dest) setDest(s.dest);
        if (typeof s.slider === "number") setSlider(s.slider);
        if (typeof s.maxTransfers === "number") setMaxTransfers(s.maxTransfers);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!origin && !dest) return;
    try {
      localStorage.setItem(
        "walkmaxxing:lastSearch",
        JSON.stringify({ origin, dest, slider, maxTransfers })
      );
    } catch {}
  }, [origin, dest, slider, maxTransfers]);

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
      setStarred(new Set());
      setSliderTouched(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "something went wrong");
    } finally {
      setLoading(false);
    }
  }, [origin, dest, dateStr, timeStr]);

  useEffect(() => {
    if (origin && dest) void go();
  }, [origin, dest, go]);

  const ranked = useMemo(
    () =>
      itins
        ? rankItineraries(itins, slider, 8, maxTransfers >= 0 ? maxTransfers : undefined)
        : null,
    [itins, slider, maxTransfers]
  );
  // smart pick: the most walking you can get while staying within ~8 min of
  // the fastest option; hidden once the user starts moving the slider
  const smartPick = useMemo(() => {
    if (sliderTouched || !itins || itins.length === 0) return null;
    const pool = maxTransfers >= 0 ? itins.filter((i) => i.transfers <= maxTransfers) : itins;
    if (pool.length === 0) return null;
    const fastest = Math.min(...pool.map((i) => i.totalSeconds));
    return pool
      .filter((i) => i.totalSeconds <= fastest + 8 * 60)
      .reduce((a, b) => (b.walkSeconds > a.walkSeconds ? b : a));
  }, [itins, maxTransfers, sliderTouched]);
  const display = useMemo(() => {
    if (!ranked) return null;
    const list = [...ranked];
    if (smartPick && !list.some((i) => i.key === smartPick.key)) list.unshift(smartPick);
    const prio = (i: Itinerary) => (starred.has(i.key) ? 0 : i.key === smartPick?.key ? 1 : 2);
    return list.sort((a, b) => prio(a) - prio(b));
  }, [ranked, smartPick, starred]);
  const toggleStar = useCallback((key: string) => {
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const selected = useMemo(() => {
    if (!display || display.length === 0) return null;
    return display.find((i) => i.key === selectedKey) ?? display[0];
  }, [display, selectedKey]);

  return (
    <div className="relative flex h-dvh flex-col md:flex-row">
      <div
        className={`${
          mobileView === "map" ? "hidden md:flex" : "flex"
        } h-full w-full flex-col gap-3 overflow-y-auto border-r border-zinc-200 bg-zinc-50 p-4 pb-[max(5.5rem,calc(env(safe-area-inset-bottom)+4.5rem))] md:h-auto md:w-[440px] md:shrink-0 md:pb-4`}
      >
        <header>
          <h1 className="text-xl font-bold tracking-tight">walkmaxxing 🚶🚇</h1>
          <p className="text-xs text-zinc-500">
            NYC transit routing where <em>you</em> pick the walking/transfer tradeoff
          </p>
        </header>

        <div className="flex flex-col gap-2">
          <LocationInput placeholder="From (e.g. home address)" value={origin} onSelect={setOrigin} />
          <LocationInput placeholder="To (e.g. office address)" value={dest} onSelect={setDest} />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                showAdvanced
                  ? "border-zinc-400 bg-zinc-100 text-zinc-800"
                  : "border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400 hover:text-zinc-800"
              }`}
            >
              <span className={`inline-block transition-transform ${showAdvanced ? "rotate-90" : ""}`}>▸</span>
              Advanced
            </button>
            <button
              onClick={go}
              disabled={!origin || !dest || loading}
              className="ml-auto inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {loading ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                "Go"
              )}
            </button>
          </div>
          {showAdvanced && (
            <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-2">
              <div className="flex gap-2">
                <input
                  type="date"
                  className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base md:text-sm"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                />
                <input
                  type="time"
                  className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base md:text-sm"
                  value={timeStr}
                  onChange={(e) => setTimeStr(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-600">
                transfer limit
                <select
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-base md:text-sm"
                  value={maxTransfers}
                  onChange={(e) => setMaxTransfers(+e.target.value)}
                >
                  <option value={-1}>no limit</option>
                  <option value={0}>0 (one seat)</option>
                  <option value={1}>≤ 1</option>
                  <option value={2}>≤ 2</option>
                </select>
              </label>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-3">
          <div className="mb-1 flex items-center justify-between text-xs font-medium text-zinc-600">
            <span>🚇 fewest steps</span>
            <span>walkmaxx 🚶</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={slider}
            onChange={(e) => {
              setSlider(+e.target.value);
              setSliderTouched(true);
            }}
            className="walk-slider w-full"
          />
          <p className="mt-1 text-[11px] text-zinc-400">
            Slide right to trade subway transfers for more walking — results re-rank live.
          </p>
        </div>

        {loading && (
          <div className="text-center text-[11px] text-zinc-400">
            crunching subway + bus schedules… first search can take a few seconds
          </div>
        )}

        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {display && display.length === 0 && (
          <div className="text-sm text-zinc-500">No routes found — try different points.</div>
        )}

        <AnimatePresence mode="popLayout" initial={false}>
          {display?.map((it, i) => (
            <motion.div
              key={it.key}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
            >
              <ItineraryCard
                it={it}
                rank={i + 1}
                selected={selected?.key === it.key}
                delays={delays}
                starred={starred.has(it.key)}
                smartPick={smartPick?.key === it.key}
                onStar={() => toggleStar(it.key)}
                onClick={() => setSelectedKey(it.key)}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {!itins && !loading && (
          <div className="mt-4 text-center text-sm text-zinc-400">
            Enter two NYC locations to see your options.
          </div>
        )}

        <footer className="mt-auto flex items-center justify-center gap-1.5 pt-4 text-xs text-zinc-400">
          Built by{" "}
          <a
            href="https://devin.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-zinc-600 opacity-80 transition hover:opacity-100"
          >
            <Image src="/devin-mark.svg" alt="" width={16} height={16} className="h-4 w-4" />
            Devin
          </a>
        </footer>
      </div>

      <div className={`${mobileView === "list" ? "hidden md:block" : "block"} h-full flex-1 md:h-auto`}>
        <MapView itinerary={selected} origin={origin} dest={dest} />
      </div>

      <button
        onClick={() => setMobileView((v) => (v === "list" ? "map" : "list"))}
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[1100] -translate-x-1/2 rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white shadow-lg active:scale-95 md:hidden"
      >
        {mobileView === "list" ? "🗺️ Map" : "📋 List"}
      </button>
    </div>
  );
}
