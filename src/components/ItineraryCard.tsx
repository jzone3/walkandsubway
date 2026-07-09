"use client";
import { Itinerary } from "@/lib/types";
import { fmtClock, fmtDuration } from "@/lib/time";

function RouteBullet({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold text-white"
      style={{ backgroundColor: `#${color || "555"}` }}
    >
      {name}
    </span>
  );
}

export default function ItineraryCard({
  it,
  rank,
  selected,
  delays,
  starred,
  smartPick,
  onStar,
  onClick,
}: {
  it: Itinerary;
  rank: number;
  selected: boolean;
  delays: Record<string, number>;
  starred: boolean;
  smartPick: boolean;
  onStar: () => void;
  onClick: () => void;
}) {
  const walkPct = Math.round((it.walkSeconds / Math.max(1, it.totalSeconds)) * 100);
  const maxDelay = Math.max(
    0,
    ...it.legs.filter((l) => l.kind === "transit").map((l) => delays[l.routeId] ?? 0)
  );
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className={`w-full cursor-pointer rounded-xl border p-3 text-left transition ${
        selected ? "border-zinc-800 bg-zinc-50 shadow-sm" : "border-zinc-200 bg-white hover:border-zinc-400"
      } ${smartPick && !selected ? "border-emerald-300" : ""}`}
    >
      {smartPick && (
        <div className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
          ⚡ smart pick · most walking within 5 min of fastest
        </div>
      )}
      <div className="flex items-end justify-between gap-2">
        <div className="flex items-end gap-3">
          <div>
            <div className="whitespace-nowrap text-xl font-bold leading-none">{fmtDuration(it.totalSeconds)}</div>
            <div className="mt-1 text-[10px] uppercase tracking-wide text-zinc-400">total</div>
          </div>
          <div>
            <div className="whitespace-nowrap text-xl font-bold leading-none text-zinc-600">
              <span className="text-base">🚶</span>{Math.round(it.walkSeconds / 60)}
              <span className="text-xs font-medium"> min</span>
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wide text-zinc-400">walk</div>
          </div>
          <div>
            <div className="whitespace-nowrap text-xl font-bold leading-none text-zinc-600">
              <span className="text-base">🚇</span>{Math.round(it.rideSeconds / 60)}
              <span className="text-xs font-medium"> min</span>
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wide text-zinc-400">ride</div>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span
            role="button"
            tabIndex={0}
            aria-label={starred ? "unstar route" : "star route"}
            onClick={(e) => {
              e.stopPropagation();
              onStar();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                onStar();
              }
            }}
            className={`-mr-1 -mt-1 px-1 text-lg leading-none transition hover:scale-110 ${
              starred ? "text-amber-400" : "text-zinc-300 hover:text-amber-400"
            }`}
          >
            {starred ? "★" : "☆"}
          </span>
          <div className="whitespace-nowrap text-xs text-zinc-500">
            {fmtClock(it.departTime)} → {fmtClock(it.arriveTime)}
          </div>
          <div className="text-xs text-zinc-400">#{rank}</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
        <span className="flex flex-wrap items-center gap-1.5">
          {it.legs.map((l, i) =>
            l.kind === "transit" ? (
              <RouteBullet key={i} name={l.routeName} color={l.routeColor} />
            ) : l.seconds >= 120 ? (
              <span key={i} className="text-zinc-500">
                🚶{Math.round(l.seconds / 60)}min
              </span>
            ) : null
          )}
        </span>
        <span className="text-zinc-400">·</span>
        <span>
          {it.transfers} transfer{it.transfers === 1 ? "" : "s"}
        </span>
        <span className="text-zinc-400">·</span>
        <span>{walkPct}% walking</span>
        {it.waitSeconds > 60 && <span>⏳ {fmtDuration(it.waitSeconds)} wait</span>}
        {maxDelay > 90 && (
          <span className="font-medium text-amber-600">⚠ +{Math.round(maxDelay / 60)} min delays</span>
        )}
      </div>
      {selected && (
        <ol className="mt-3 space-y-1.5 border-t border-zinc-200 pt-2 text-xs text-zinc-700">
          {it.legs.map((l, i) =>
            l.kind === "walk" ? (
              <li key={i}>
                🚶 Walk {fmtDuration(l.seconds)} ({(l.meters / 1609).toFixed(1)} mi) — {l.from} → {l.to}
              </li>
            ) : (
              <li key={i} className="flex items-center gap-1.5">
                <RouteBullet name={l.routeName} color={l.routeColor} />
                <span>
                  {l.boardStop} → {l.alightStop} · {fmtClock(l.boardTime)}–{fmtClock(l.alightTime)} ·{" "}
                  {l.stops.length - 1} stops
                  {(delays[l.routeId] ?? 0) > 90 && (
                    <span className="text-amber-600"> · running +{Math.round((delays[l.routeId] ?? 0) / 60)} min late</span>
                  )}
                </span>
              </li>
            )
          )}
        </ol>
      )}
    </div>
  );
}
