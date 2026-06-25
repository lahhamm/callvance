import { Router } from "express";
import { db, availabilityTable, bookingsTable } from "@workspace/db";
import { eq, and, gte, lt } from "drizzle-orm";
import { addDays, startOfDay, parseISO, format, addMinutes, getDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

const router = Router();

async function ensureAvailability() {
  const existing = await db.select().from(availabilityTable).limit(1);
  if (existing.length === 0) {
    const inserted = await db.insert(availabilityTable).values({}).returning();
    return inserted[0];
  }
  return existing[0];
}

function serializeAvailability(a: typeof availabilityTable.$inferSelect) {
  return {
    ...a,
    availableDays: JSON.parse(a.availableDays) as number[],
    updatedAt: a.updatedAt.toISOString(),
  };
}

router.get("/availability", async (_req, res) => {
  const avail = await ensureAvailability();
  res.json(serializeAvailability(avail));
});

router.put("/availability", async (req, res) => {
  const { timezone, notificationEmail, availableDays, startTime, endTime, slotDurationMinutes } = req.body as {
    timezone?: string;
    notificationEmail?: string;
    availableDays?: number[];
    startTime?: string;
    endTime?: string;
    slotDurationMinutes?: number;
  };

  await ensureAvailability();

  const updated = await db.update(availabilityTable).set({
    ...(timezone && { timezone }),
    ...(notificationEmail !== undefined && { notificationEmail }),
    ...(availableDays && { availableDays: JSON.stringify(availableDays) }),
    ...(startTime && { startTime }),
    ...(endTime && { endTime }),
    ...(slotDurationMinutes && { slotDurationMinutes }),
    updatedAt: new Date(),
  }).returning();

  res.json(serializeAvailability(updated[0]));
});

router.get("/availability/slots", async (req, res) => {
  const daysAhead = Number(req.query.days ?? 7);
  const avail = await ensureAvailability();
  const availableDays: number[] = JSON.parse(avail.availableDays);
  const tz = avail.timezone;

  const now = new Date();
  const slots: string[] = [];

  const existingBookings = await db.select({ scheduledAt: bookingsTable.scheduledAt })
    .from(bookingsTable)
    .where(
      and(
        gte(bookingsTable.scheduledAt, now),
        eq(bookingsTable.status, "confirmed")
      )
    );
  const bookedTimes = new Set(existingBookings.map(b => b.scheduledAt.toISOString()));

  for (let d = 0; d < daysAhead; d++) {
    const dayDate = addDays(now, d);
    const zonedDay = toZonedTime(dayDate, tz);
    const dayOfWeek = getDay(zonedDay);

    if (!availableDays.includes(dayOfWeek)) continue;

    const [startH, startM] = avail.startTime.split(":").map(Number);
    const [endH, endM] = avail.endTime.split(":").map(Number);

    const dayStart = toZonedTime(startOfDay(dayDate), tz);
    dayStart.setHours(startH, startM, 0, 0);
    const dayEnd = toZonedTime(startOfDay(dayDate), tz);
    dayEnd.setHours(endH, endM, 0, 0);

    let cursor = fromZonedTime(dayStart, tz);
    const end = fromZonedTime(dayEnd, tz);

    while (cursor < end) {
      if (cursor > now) {
        const iso = cursor.toISOString();
        if (!bookedTimes.has(iso)) {
          slots.push(iso);
        }
      }
      cursor = addMinutes(cursor, avail.slotDurationMinutes);
    }
  }

  res.json({ slots, timezone: tz });
});

export default router;
export { ensureAvailability, serializeAvailability };
