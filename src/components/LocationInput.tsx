"use client";
import { useEffect, useRef, useState } from "react";

export interface Place {
  label: string;
  lat: number;
  lon: number;
}

export default function LocationInput({
  placeholder,
  value,
  onSelect,
}: {
  placeholder: string;
  value: Place | null;
  onSelect: (p: Place | null) => void;
}) {
  const [query, setQuery] = useState(value?.label ?? "");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value && value.label !== query) setQuery(value.label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("touchstart", onClick as unknown as EventListener);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("touchstart", onClick as unknown as EventListener);
    };
  }, []);

  const search = (q: string) => {
    setQuery(q);
    onSelect(null);
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 3) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(data.results ?? []);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = {
          label: "Current location",
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        };
        onSelect(p);
        setQuery(p.label);
        setOpen(false);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="relative flex-1" ref={boxRef}>
      <input
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 pr-10 text-base outline-none focus:border-zinc-500 md:text-sm"
        placeholder={placeholder}
        value={query}
        onChange={(e) => search(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
      />
      <button
        type="button"
        title="Use current location"
        onClick={useCurrentLocation}
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-2 text-sm text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
      >
        {locating ? "…" : "📍"}
      </button>
      {loading && (
        <div className="absolute right-10 top-1/2 -translate-y-1/2 text-xs text-zinc-400">…</div>
      )}
      {open && results.length > 0 && (
        <ul className="absolute z-[1000] mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
          {results.map((r, i) => (
            <li key={i}>
              <button
                className="block w-full px-3 py-2.5 text-left text-sm hover:bg-zinc-100 md:py-2"
                onClick={() => {
                  onSelect(r);
                  setQuery(r.label);
                  setOpen(false);
                }}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
