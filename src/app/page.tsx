"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [avoidLines, setAvoidLines] = useState<Set<string>>(new Set());
  const [itins, setItins] = useState<Itinerary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [sliderTouched, setSliderTouched] = useState(false);
  const [showStarred, setShowStarred] = useState(false);
  const [showSmartPicks, setShowSmartPicks] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [delays, setDelays] = useState<Record<string, number>>({});
  const [mobileView, setMobileView] = useState<"list" | "map">("list");

  useEffect(() => {
    const now = nowInNY();
    setDateStr(now.dateStr);
    setTimeStr(now.timeStr);
    try {
      const q = new URLSearchParams(window.location.search);
      const parsePlace = (v: string | null): Place | null => {
        if (!v) return null;
        const [label, lat, lon] = v.split("|");
        return label && isFinite(+lat) && isFinite(+lon) ? { label, lat: +lat, lon: +lon } : null;
      };
      const from = parsePlace(q.get("from"));
      const to = parsePlace(q.get("to"));
      if (from || to) {
        if (from) setOrigin(from);
        if (to) setDest(to);
        if (q.get("s") !== null) setSlider(+q.get("s")!);
        if (q.get("xfer") !== null) setMaxTransfers(+q.get("xfer")!);
        if (q.get("avoid")) setAvoidLines(new Set(q.get("avoid")!.split(",")));
        return;
      }
      const saved = localStorage.getItem("walkmaxxing:lastSearch");
      if (saved) {
        const s = JSON.parse(saved);
        if (s.origin) setOrigin(s.origin);
        if (s.dest) setDest(s.dest);
        if (typeof s.slider === "number") setSlider(s.slider);
        if (typeof s.maxTransfers === "number") setMaxTransfers(s.maxTransfers);
        if (Array.isArray(s.avoidLines)) setAvoidLines(new Set(s.avoidLines));
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!origin && !dest) return;
    try {
      localStorage.setItem(
        "walkmaxxing:lastSearch",
        JSON.stringify({ origin, dest, slider, maxTransfers, avoidLines: [...avoidLines] })
      );
    } catch {}
  }, [origin, dest, slider, maxTransfers, avoidLines]);

  const [shareCopied, setShareCopied] = useState(false);
  const share = useCallback(() => {
    const q = new URLSearchParams();
    if (origin) q.set("from", `${origin.label}|${origin.lat.toFixed(5)}|${origin.lon.toFixed(5)}`);
    if (dest) q.set("to", `${dest.label}|${dest.lat.toFixed(5)}|${dest.lon.toFixed(5)}`);
    q.set("s", String(slider));
    if (maxTransfers >= 0) q.set("xfer", String(maxTransfers));
    if (avoidLines.size > 0) q.set("avoid", [...avoidLines].join(","));
    void navigator.clipboard
      .writeText(`${window.location.origin}/?${q.toString()}`)
      .then(() => {
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 1500);
      });
  }, [origin, dest, slider, maxTransfers, avoidLines]);

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
      setShowStarred(false);
      setShowSmartPicks(false);
      setVisibleCount(10);
    } catch (e) {
      setError(e instanceof Error ? e.message : "something went wrong");
    } finally {
      setLoading(false);
    }
  }, [origin, dest, dateStr, timeStr]);

  useEffect(() => {
    if (origin && dest) void go();
  }, [origin, dest, go]);

  const allLines = useMemo(() => {
    const m = new Map<string, { id: string; name: string; color: string }>();
    for (const it of itins ?? [])
      for (const l of it.legs)
        if (l.kind === "transit" && !m.has(l.routeId))
          m.set(l.routeId, { id: l.routeId, name: l.routeName, color: l.routeColor });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [itins]);
  const usable = useMemo(
    () =>
      itins
        ? itins.filter(
            (i) => !i.legs.some((l) => l.kind === "transit" && avoidLines.has(l.routeId))
          )
        : null,
    [itins, avoidLines]
  );
  const rankedRes = useMemo(
    () =>
      usable
        ? rankItineraries(usable, slider, Infinity, maxTransfers >= 0 ? maxTransfers : undefined)
        : null,
    [usable, slider, maxTransfers]
  );
  const ranked = rankedRes?.list ?? null;
  const budget = rankedRes?.budget ?? null;
  // smart pick: the most walking you can get while staying within ~8 min of
  // the fastest option; hidden once the user starts moving the slider
  const smartPick = useMemo(() => {
    if (sliderTouched || !usable || usable.length === 0) return null;
    const pool = maxTransfers >= 0 ? usable.filter((i) => i.transfers <= maxTransfers) : usable;
    if (pool.length === 0) return null;
    const fastest = Math.min(...pool.map((i) => i.totalSeconds));
    return pool
      .filter((i) => i.totalSeconds <= fastest + 8 * 60)
      .reduce((a, b) => (b.walkSeconds > a.walkSeconds ? b : a));
  }, [usable, maxTransfers, sliderTouched]);
  // smartpicks: the walk/time frontier — routes where getting more walking
  // necessarily means a slower trip
  const smartPickKeys = useMemo(() => {
    if (!usable) return new Set<string>();
    const pool = maxTransfers >= 0 ? usable.filter((i) => i.transfers <= maxTransfers) : usable;
    const sorted = [...pool].sort((a, b) => a.totalSeconds - b.totalSeconds);
    const keys = new Set<string>();
    let maxWalk = -1;
    for (const it of sorted) {
      if (it.walkSeconds > maxWalk) {
        keys.add(it.key);
        maxWalk = it.walkSeconds;
      }
    }
    return keys;
  }, [usable, maxTransfers]);
  const display = useMemo(() => {
    if (!ranked) return null;
    if (showStarred) return (usable ?? []).filter((i) => starred.has(i.key));
    if (showSmartPicks)
      return ranked
        .filter((i) => smartPickKeys.has(i.key))
        .sort((a, b) => {
          if (a.key === smartPick?.key) return -1;
          if (b.key === smartPick?.key) return 1;
          return a.totalSeconds - b.totalSeconds;
        });
    const list = [...ranked];
    if (smartPick && !list.some((i) => i.key === smartPick.key)) list.unshift(smartPick);
    return list.sort(
      (a, b) => (a.key === smartPick?.key ? 0 : 1) - (b.key === smartPick?.key ? 0 : 1)
    );
  }, [ranked, usable, smartPick, starred, showStarred, showSmartPicks, smartPickKeys]);
  const toggleStar = useCallback((key: string) => {
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (next.size === 0) setShowStarred(false);
      return next;
    });
  }, []);
  const rendered = useMemo(() => display?.slice(0, visibleCount) ?? null, [display, visibleCount]);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisibleCount((c) => c + 10);
      },
      { rootMargin: "400px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [display]);
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
        <header className="relative">
          <h1 className="text-xl font-bold tracking-tight">Walk & Subway Routes 🚶🚇</h1>
          <p className="text-xs text-zinc-500">walkmaxxing</p>
          <button
            aria-label="copy share link"
            title={shareCopied ? "copied!" : "copy share link"}
            onClick={share}
            disabled={!origin || !dest}
            className="absolute right-0 top-0 rounded-lg p-2.5 text-base text-zinc-400 transition hover:bg-zinc-100 hover:text-sky-600 disabled:opacity-30 md:p-1.5"
          >
            {shareCopied ? "✓" : "🔗"}
          </button>
        </header>

        <div className="flex flex-col gap-2">
          <div className="relative flex flex-col gap-2">
            <LocationInput placeholder="From (e.g. home address)" value={origin} onSelect={setOrigin} />
            <LocationInput placeholder="To (e.g. office address)" value={dest} onSelect={setDest} />
            <button
              aria-label="flip directions"
              onClick={() => {
                const o = origin;
                setOrigin(dest);
                setDest(o);
              }}
              disabled={!origin && !dest}
              className="absolute right-8 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-300 bg-white text-base text-zinc-500 shadow-sm transition hover:border-zinc-400 hover:text-zinc-800 disabled:opacity-40 md:h-8 md:w-8 md:text-sm"
            >
              ⇅
            </button>
          </div>
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
              onClick={() => {
                setShowSmartPicks((v) => !v);
                setShowStarred(false);
                setSlider(50);
                setSliderTouched(false);
              }}
              disabled={!itins}
              className={`inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium transition disabled:opacity-40 ${
                showSmartPicks
                  ? "border-emerald-500 bg-emerald-500 text-white shadow-sm ring-2 ring-emerald-200"
                  : "border-zinc-300 bg-white text-zinc-600 hover:border-emerald-400 hover:text-emerald-700"
              }`}
            >
              ⚡ Smartpicks
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
              {allLines.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-600">
                  avoid lines
                  {allLines.map((r) => {
                    const off = avoidLines.has(r.id);
                    return (
                      <button
                        key={r.id}
                        aria-label={`${off ? "allow" : "avoid"} ${r.name}`}
                        onClick={() =>
                          setAvoidLines((prev) => {
                            const next = new Set(prev);
                            if (next.has(r.id)) next.delete(r.id);
                            else next.add(r.id);
                            return next;
                          })
                        }
                        className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full px-1.5 text-xs font-bold text-white transition md:h-6 md:min-w-6 md:px-1 ${
                          off ? "opacity-25 line-through" : ""
                        }`}
                        style={{ backgroundColor: `#${r.color || "555"}` }}
                      >
                        {r.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {!showSmartPicks && (
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
            Slide right to allow a longer trip — the most walking within that time shows first.
          </p>
        </div>
        )}

        {loading && (
          <div className="text-center text-[11px] text-zinc-400">
            crunching subway + bus schedules… first search can take a few seconds
          </div>
        )}

        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {starred.size > 0 && (
          <button
            onClick={() => {
              setShowStarred((v) => !v);
              setShowSmartPicks(false);
            }}
            className={`self-start rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              showStarred
                ? "border-amber-400 bg-amber-50 text-amber-700"
                : "border-zinc-300 bg-white text-zinc-600 hover:border-amber-400 hover:text-amber-600"
            }`}
          >
            ★ starred ({starred.size})
          </button>
        )}

        {display && display.length === 0 && (
          <div className="text-sm text-zinc-500">No routes found — try different points.</div>
        )}

        <AnimatePresence mode="popLayout" initial={false}>
          {rendered?.map((it, i) => {
            const showDivider =
              !showStarred &&
              !showSmartPicks &&
              budget !== null &&
              it.totalSeconds > budget &&
              it.key !== smartPick?.key &&
              (i === 0 ||
                rendered[i - 1].totalSeconds <= budget ||
                rendered[i - 1].key === smartPick?.key);
            return (
            <motion.div
              key={it.key}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
            >
              {showDivider && (
                <div className="mb-3 flex items-center gap-2 text-[11px] text-zinc-400">
                  <div className="h-px flex-1 bg-zinc-200" />
                  all other permutations, fastest first
                  <div className="h-px flex-1 bg-zinc-200" />
                </div>
              )}
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
            );
          })}
        </AnimatePresence>

        {display && visibleCount < display.length && (
          <div ref={sentinelRef} className="py-2 text-center text-[11px] text-zinc-400">
            {display.length - visibleCount} more…
          </div>
        )}

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
            className="inline-flex items-center gap-1 py-2 font-medium text-zinc-600 opacity-80 transition hover:opacity-100"
          >
            <Image src="/devin-mark.svg" alt="" width={16} height={16} className="h-4 w-4" />
            Devin
          </a>
          <span className="text-zinc-300">·</span>
          <a
            href="https://github.com/jzone3/walkandsubway"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="view source on GitHub"
            className="inline-flex items-center py-2 text-zinc-400 transition hover:text-zinc-600"
          >
            <svg viewBox="0 0 16 16" width={14} height={14} fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
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
