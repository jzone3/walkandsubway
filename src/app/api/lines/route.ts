import { NextResponse } from "next/server";
import { loadTimetable } from "@/lib/timetable.server";

export const dynamic = "force-static";

export async function GET() {
  const tt = loadTimetable();
  const lines = tt.routes
    .filter((r) => r.type !== 3)
    .map((r) => ({ id: r.id, name: r.name, longName: r.longName, color: r.color }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return NextResponse.json({ lines });
}
