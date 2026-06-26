import { db, bookingsTable } from "@workspace/db";
import { and, eq, gte, lt } from "drizzle-orm";

export type AvailRow = {
  timezone: string;
  availableDays: string;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  preventOverlaps: boolean;
};

function getDayOfWeekInTz(dateStr: string, tz: string): number {
  const noonUtc = new Date(`${dateStr}T12:00:00Z`);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(noonUtc);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day);
}

function getOffsetMs(dateStr: string, tz: string): number {
  const noonUtc = new Date(`${dateStr}T12:00:00Z`);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const str = fmt.format(noonUtc);
  const match = str.match(/(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2})/);
  if (!match) throw new Error(`Could not parse tz date: ${str}`);
  const [, mo, d, y, h, m] = match.map(Number);
  return noonUtc.getTime() - Date.UTC(y, mo - 1, d, h, m);
}

function localTimeToUtc(dateStr: string, timeStr: string, offsetMs: number): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0) + offsetMs);
}

export async function computeSlots(clientId: number, dateStr: string, avail: AvailRow): Promise<Date[]> {
  const availDays: number[] = JSON.parse(avail.availableDays);
  const tz = avail.timezone;

  const dow = getDayOfWeekInTz(dateStr, tz);
  if (!availDays.includes(dow)) return [];

  const offsetMs = getOffsetMs(dateStr, tz);

  const [startH, startM] = avail.startTime.split(":").map(Number);
  const [endH, endM] = avail.endTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const duration = avail.slotDurationMinutes;

  const allSlots: Date[] = [];
  for (let min = startMinutes; min + duration <= endMinutes; min += duration) {
    const h = String(Math.floor(min / 60)).padStart(2, "0");
    const mn = String(min % 60).padStart(2, "0");
    allSlots.push(localTimeToUtc(dateStr, `${h}:${mn}`, offsetMs));
  }

  if (!avail.preventOverlaps) return allSlots;

  const dayStart = localTimeToUtc(dateStr, "00:00", offsetMs);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const existingBookings = await db.select().from(bookingsTable).where(
    and(
      eq(bookingsTable.clientId, clientId),
      eq(bookingsTable.status, "confirmed"),
      gte(bookingsTable.scheduledAt, dayStart),
      lt(bookingsTable.scheduledAt, dayEnd),
    ),
  );

  const slotMs = duration * 60 * 1000;
  return allSlots.filter(slot => {
    const sStart = slot.getTime();
    const sEnd = sStart + slotMs;
    return !existingBookings.some(b => {
      const bStart = b.scheduledAt.getTime();
      const bEnd = bStart + slotMs;
      return sStart < bEnd && bStart < sEnd;
    });
  });
}

export function getNextAvailableDays(n: number, avail: AvailRow): string[] {
  const tz = avail.timezone;
  const availDays: number[] = JSON.parse(avail.availableDays);
  const results: string[] = [];
  const now = new Date();

  for (let i = 0; i < 60 && results.length < n; i++) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
    const dow = getDayOfWeekInTz(dateStr, tz);
    if (availDays.includes(dow)) results.push(dateStr);
  }

  return results;
}

export function formatSlotsForPrompt(slots: Date[], tz: string): string {
  if (slots.length === 0) return "";

  const grouped = new Map<string, Date[]>();
  for (const slot of slots) {
    const dateLabel = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, weekday: "long", month: "long", day: "numeric",
    }).format(slot);
    if (!grouped.has(dateLabel)) grouped.set(dateLabel, []);
    grouped.get(dateLabel)!.push(slot);
  }

  const lines = Array.from(grouped.entries()).map(([dateLabel, daySlots]) => {
    const times = daySlots
      .map(s => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(s))
      .join(", ");
    return `${dateLabel}: ${times}`;
  });

  return "Available appointment slots (only offer these exact times, do not suggest any other times):\n" + lines.join("\n");
}
