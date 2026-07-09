// All times are seconds since midnight, America/New_York.

export function nowInNY(): { seconds: number; dayBit: number; dateStr: string; timeStr: string } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  const hour = parts.hour === "24" ? 0 : +parts.hour;
  const seconds = hour * 3600 + +parts.minute * 60;
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayBit = dayNames.indexOf(parts.weekday);
  return {
    seconds,
    dayBit,
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    timeStr: `${String(hour).padStart(2, "0")}:${parts.minute}`,
  };
}

export function dayBitFromDateStr(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00`);
  const js = d.getDay(); // 0 = Sun
  return js === 0 ? 6 : js - 1;
}

export function secondsFromTimeStr(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 3600 + m * 60;
}

export function fmtClock(seconds: number): string {
  const s = ((seconds % 86400) + 86400) % 86400;
  let h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function fmtDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
