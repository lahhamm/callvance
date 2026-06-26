import { Router } from "express";
import { eq, and, gte, desc } from "drizzle-orm";
import { db, clientsTable, callsTable, bookingsTable } from "@workspace/db";

const router = Router();

function serializeCall(c: typeof callsTable.$inferSelect) {
  return { ...c, createdAt: c.createdAt.toISOString(), startedAt: c.startedAt?.toISOString() ?? null, endedAt: c.endedAt?.toISOString() ?? null };
}
function serializeBooking(b: typeof bookingsTable.$inferSelect) {
  return { ...b, scheduledAt: b.scheduledAt.toISOString(), createdAt: b.createdAt.toISOString(), updatedAt: b.updatedAt.toISOString() };
}

async function resolveClient(token: string) {
  const rows = await db.select().from(clientsTable).where(eq(clientsTable.accessToken, token)).limit(1);
  return rows[0] ?? null;
}

router.get("/client/:token", async (req, res) => {
  const client = await resolveClient(req.params.token);
  if (!client) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ id: client.id, name: client.name, businessType: client.businessType });
});

router.get("/client/:token/calls", async (req, res) => {
  const client = await resolveClient(req.params.token);
  if (!client) { res.status(404).json({ error: "Not found" }); return; }
  const calls = await db.select().from(callsTable).where(eq(callsTable.clientId, client.id)).orderBy(desc(callsTable.createdAt));
  res.json(calls.map(serializeCall));
});

router.get("/client/:token/bookings", async (req, res) => {
  const client = await resolveClient(req.params.token);
  if (!client) { res.status(404).json({ error: "Not found" }); return; }
  const now = new Date();
  const { availabilityTable } = await import("@workspace/db");
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
