import { Router } from "express";
import { eq, and, gte, desc } from "drizzle-orm";
import { db, clientsTable, callsTable, bookingsTable, availabilityTable, contactsTable } from "@workspace/db";
import { computeSlots } from "../lib/availability-slots";

const router = Router();

function serializeCall(c: typeof callsTable.$inferSelect) {
  return { ...c, createdAt: c.createdAt.toISOString(), startedAt: c.startedAt?.toISOString() ?? null, endedAt: c.endedAt?.toISOString() ?? null };
}
function serializeBooking(b: typeof bookingsTable.$inferSelect) {
  return { ...b, scheduledAt: b.scheduledAt.toISOString(), createdAt: b.createdAt.toISOString(), updatedAt: b.updatedAt.toISOString() };
}

async function resolveClient(token: string) {
  const rows = await db.select().from(clientsTable).where(eq(clientsTable.accessToken, token)).limit(1);
  const client = rows[0] ?? null;
  if (!client || !client.isActive) return null;
  return client;
}

router.get("/client/:token", async (req, res) => {
  const client = await resolveClient(req.params.token);
  if (!client) { res.status(403).json({ error: "Access revoked or invalid link" }); return; }
  res.json({ id: client.id, name: client.name, businessType: client.businessType, calUsername: client.calUsername ?? null, calEventId: client.calEventId ?? null });
});

router.get("/client/:token/calls", async (req, res) => {
  const client = await resolveClient(req.params.token);
  if (!client) { res.status(403).json({ error: "Access revoked or invalid link" }); return; }
  const rows = await db
    .select()
    .from(callsTable)
    .leftJoin(contactsTable, eq(callsTable.contactId, contactsTable.id))
    .where(eq(callsTable.clientId, client.id))
    .orderBy(desc(callsTable.createdAt));
  // Prefer the name stored on the call record; fall back to the contacts table;
  // fall back to phone number so the portal always shows something human-readable.
  const calls = rows.map((row: any) => ({
    ...row.calls,
    contactName: row.calls.contactName?.trim() || row.contacts?.name?.trim() || row.calls.contactPhone,
  }));
  res.json(calls.map(serializeCall));
});

router.get("/client/:token/availability/slots", async (req, res) => {
  const client = await resolveClient(req.params.token);
  if (!client) { res.status(403).json({ error: "Access revoked or invalid link" }); return; }

  const dateStr = req.query.date as string;
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    res.status(400).json({ error: "date query param required (YYYY-MM-DD)" }); return;
  }

  const availRows = await db.select().from(availabilityTable).where(eq(availabilityTable.clientId, client.id)).limit(1);
  if (!availRows[0]) { res.json([]); return; }

  const avail = availRows[0];
  const slots = await computeSlots(client.id, dateStr, avail);
  const tz = avail.timezone;

  const isoSlots = slots.map(s =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(s) + "T" +
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).format(s)
  );

  res.json(isoSlots);
});

router.get("/client/:token/bookings", async (req, res) => {
  const client = await resolveClient(req.params.token);
  if (!client) { res.status(403).json({ error: "Access revoked or invalid link" }); return; }
  const now = new Date();
  const [bookings, availRows] = await Promise.all([
    db.select().from(bookingsTable)
      .where(and(eq(bookingsTable.clientId, client.id), gte(bookingsTable.scheduledAt, now), eq(bookingsTable.status, "confirmed")))
      .orderBy(bookingsTable.scheduledAt),
    db.select().from(availabilityTable).where(eq(availabilityTable.clientId, client.id)).limit(1),
  ]);
  const timezone = availRows[0]?.timezone ?? null;
  res.json(bookings.map(b => ({ ...serializeBooking(b), timezone })));
});

export default router;
