import { Router } from "express";
import { eq, desc, and, isNull } from "drizzle-orm";
import crypto from "crypto";
import {
  db, clientsTable, contactsTable, callsTable, bookingsTable,
  agentConfigTable, availabilityTable,
} from "@workspace/db";
import { adminAuth } from "../middlewares/admin-auth";
import Anthropic from "@anthropic-ai/sdk";

const router = Router();
router.use(adminAuth);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BLAND_API_KEY = process.env.BLAND_AI_API_KEY;
const BLAND_BASE_URL = "https://api.bland.ai/v1";

function serializeClient(c: typeof clientsTable.$inferSelect) {
  return { ...c, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() };
}
function serializeContact(c: typeof contactsTable.$inferSelect) {
  return { ...c, createdAt: c.createdAt.toISOString(), lastCalledAt: c.lastCalledAt?.toISOString() ?? null };
}
function serializeCall(c: typeof callsTable.$inferSelect) {
  return { ...c, createdAt: c.createdAt.toISOString(), startedAt: c.startedAt?.toISOString() ?? null, endedAt: c.endedAt?.toISOString() ?? null };
}
function serializeBooking(b: typeof bookingsTable.$inferSelect) {
  return { ...b, scheduledAt: b.scheduledAt.toISOString(), createdAt: b.createdAt.toISOString(), updatedAt: b.updatedAt.toISOString() };
}
function serializeConfig(a: typeof agentConfigTable.$inferSelect) {
  return { ...a, updatedAt: a.updatedAt.toISOString() };
}
function serializeAvail(a: typeof availabilityTable.$inferSelect) {
  return { ...a, availableDays: JSON.parse(a.availableDays) as number[], updatedAt: a.updatedAt.toISOString() };
}

// ── CLIENTS ──────────────────────────────────────────────────────────────────

router.get("/admin/clients", async (_req, res) => {
  const clients = await db.select().from(clientsTable).orderBy(clientsTable.createdAt);
  const enriched = await Promise.all(clients.map(async (c) => {
    const [calls, bookings, contacts] = await Promise.all([
      db.select().from(callsTable).where(eq(callsTable.clientId, c.id)),
      db.select().from(bookingsTable).where(and(eq(bookingsTable.clientId, c.id), eq(bookingsTable.status, "confirmed"))),
      db.select().from(contactsTable).where(eq(contactsTable.clientId, c.id)),
    ]);
    return { ...serializeClient(c), callCount: calls.length, bookingCount: bookings.length, contactCount: contacts.length };
  }));
  res.json(enriched);
});

router.post("/admin/clients", async (req, res) => {
  const { name, businessType, phone } = req.body as { name: string; businessType?: string; phone?: string };
  if (!name) { res.status(400).json({ error: "name required" }); return; }

  const accessToken = crypto.randomUUID().replace(/-/g, "");
  const inserted = await db.insert(clientsTable).values({ name, businessType: businessType || "", phone: phone || "", accessToken }).returning();
  const client = inserted[0];

  await db.insert(agentConfigTable).values({ clientId: client.id }).returning();
  await db.insert(availabilityTable).values({ clientId: client.id }).returning();

  res.status(201).json(serializeClient(client));
});

router.get("/admin/clients/:id", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db.select().from(clientsTable).where(eq(clientsTable.id, id)).limit(1);
  if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeClient(rows[0]));
});

router.patch("/admin/clients/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, businessType, phone, isActive } = req.body as { name?: string; businessType?: string; phone?: string; isActive?: boolean };
  const updated = await db.update(clientsTable).set({
    ...(name && { name }),
    ...(businessType !== undefined && { businessType }),
    ...(phone !== undefined && { phone }),
    ...(isActive !== undefined && { isActive }),
    updatedAt: new Date(),
  }).where(eq(clientsTable.id, id)).returning();
  if (!updated[0]) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeClient(updated[0]));
});

router.delete("/admin/clients/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(clientsTable).where(eq(clientsTable.id, id));
  res.json({ ok: true });
});

// ── CONTACTS ──────────────────────────────────────────────────────────────────

router.get("/admin/clients/:id/contacts", async (req, res) => {
  const clientId = Number(req.params.id);
  const contacts = await db.select().from(contactsTable).where(eq(contactsTable.clientId, clientId)).orderBy(contactsTable.createdAt);
  res.json(contacts.map(serializeContact));
});

router.post("/admin/clients/:id/contacts", async (req, res) => {
  const clientId = Number(req.params.id);
  const { name, phone, email, company, notes } = req.body as { name: string; phone: string; email?: string; company?: string; notes?: string };
  if (!name || !phone) { res.status(400).json({ error: "name and phone required" }); return; }
  const inserted = await db.insert(contactsTable).values({ clientId, name, phone, email, company, notes }).returning();
  res.status(201).json(serializeContact(inserted[0]));
});

router.delete("/admin/clients/:id/contacts/:contactId", async (req, res) => {
  await db.delete(contactsTable).where(eq(contactsTable.id, Number(req.params.contactId)));
  res.json({ ok: true });
});

// ── AGENT CONFIG ──────────────────────────────────────────────────────────────

async function ensureClientConfig(clientId: number) {
  const existing = await db.select().from(agentConfigTable).where(eq(agentConfigTable.clientId, clientId)).limit(1);
  if (existing.length === 0) {
    const inserted = await db.insert(agentConfigTable).values({ clientId }).returning();
    return inserted[0];
  }
  return existing[0];
}

router.get("/admin/clients/:id/config", async (req, res) => {
  const clientId = Number(req.params.id);
  const config = await ensureClientConfig(clientId);
  res.json(serializeConfig(config));
});

router.put("/admin/clients/:id/config", async (req, res) => {
  const clientId = Number(req.params.id);
  await ensureClientConfig(clientId);
  const { agentName, voice, prompt, firstMessage, maxDuration, qualificationCriteria } = req.body as {
    agentName?: string; voice?: string; prompt?: string; firstMessage?: string; maxDuration?: number; qualificationCriteria?: string;
  };
  const updated = await db.update(agentConfigTable).set({
    ...(agentName && { agentName }),
    ...(voice && { voice }),
    ...(prompt && { prompt }),
    ...(firstMessage && { firstMessage }),
    ...(maxDuration && { maxDuration }),
    ...(qualificationCriteria !== undefined && { qualificationCriteria }),
    updatedAt: new Date(),
  }).where(eq(agentConfigTable.clientId, clientId)).returning();
  res.json(serializeConfig(updated[0]));
});

// ── AVAILABILITY ──────────────────────────────────────────────────────────────

async function ensureClientAvailability(clientId: number) {
  const existing = await db.select().from(availabilityTable).where(eq(availabilityTable.clientId, clientId)).limit(1);
  if (existing.length === 0) {
    const inserted = await db.insert(availabilityTable).values({ clientId }).returning();
    return inserted[0];
  }
  return existing[0];
}

router.get("/admin/clients/:id/availability", async (req, res) => {
  const clientId = Number(req.params.id);
  const avail = await ensureClientAvailability(clientId);
  res.json(serializeAvail(avail));
});

router.put("/admin/clients/:id/availability", async (req, res) => {
  const clientId = Number(req.params.id);
  await ensureClientAvailability(clientId);
  const { timezone, notificationEmail, availableDays, startTime, endTime, slotDurationMinutes } = req.body as {
    timezone?: string; notificationEmail?: string | null; availableDays?: number[]; startTime?: string; endTime?: string; slotDurationMinutes?: number;
  };
  const updated = await db.update(availabilityTable).set({
    ...(timezone && { timezone }),
    ...(notificationEmail !== undefined && { notificationEmail }),
    ...(availableDays && { availableDays: JSON.stringify(availableDays) }),
    ...(startTime && { startTime }),
    ...(endTime && { endTime }),
    ...(slotDurationMinutes && { slotDurationMinutes }),
    updatedAt: new Date(),
  }).where(eq(availabilityTable.clientId, clientId)).returning();
  res.json(serializeAvail(updated[0]));
});

// ── CALLS ─────────────────────────────────────────────────────────────────────

router.get("/admin/clients/:id/calls", async (req, res) => {
  const clientId = Number(req.params.id);
  const calls = await db.select().from(callsTable).where(eq(callsTable.clientId, clientId)).orderBy(desc(callsTable.createdAt));
  res.json(calls.map(serializeCall));
});

router.post("/admin/clients/:id/calls/initiate", async (req, res) => {
  const clientId = Number(req.params.id);
  const { contactId } = req.body as { contactId: number };

  const contact = await db.select().from(contactsTable).where(and(eq(contactsTable.id, contactId), eq(contactsTable.clientId, clientId))).limit(1);
  if (!contact[0]) { res.status(404).json({ error: "Contact not found" }); return; }

  const config = await ensureClientConfig(clientId);
  if (!BLAND_API_KEY) { res.status(500).json({ error: "BLAND_AI_API_KEY not configured" }); return; }

  const inserted = await db.insert(callsTable).values({
    clientId, contactId, contactName: contact[0].name, contactPhone: contact[0].phone, status: "queued",
  }).returning();
  const callRecord = inserted[0];

  const replitDomain = process.env.REPLIT_DEV_DOMAIN;
  const webhookUrl = replitDomain ? `https://${replitDomain}/api/calls/webhook` : null;

  const blandPayload: Record<string, unknown> = {
    phone_number: contact[0].phone, task: config.prompt, voice: config.voice,
    first_sentence: config.firstMessage, max_duration: config.maxDuration,
    record: true, answered_by_enabled: true,
    metadata: { call_db_id: callRecord.id, contact_id: contactId, client_id: clientId },
  };
  if (webhookUrl) blandPayload.webhook = webhookUrl;

  const blandRes = await fetch(`${BLAND_BASE_URL}/calls`, {
    method: "POST",
    headers: { Authorization: BLAND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(blandPayload),
  });

  if (!blandRes.ok) {
    await db.update(callsTable).set({ status: "failed" }).where(eq(callsTable.id, callRecord.id));
    res.status(502).json({ error: "BlandAI error" }); return;
  }

  const blandData = (await blandRes.json()) as { call_id?: string };
  await db.update(callsTable).set({ blandCallId: blandData.call_id, status: "in-progress", startedAt: new Date() }).where(eq(callsTable.id, callRecord.id));
  await db.update(contactsTable).set({ lastCalledAt: new Date(), status: "contacted" }).where(eq(contactsTable.id, contactId));

  res.status(201).json(serializeCall(callRecord));
});

router.post("/admin/clients/:id/calls/bulk", async (req, res) => {
  const clientId = Number(req.params.id);
  const { contactIds } = req.body as { contactIds: number[] };
  if (!Array.isArray(contactIds) || contactIds.length === 0) { res.status(400).json({ error: "contactIds required" }); return; }

  const results = [];
  for (const contactId of contactIds) {
    try {
      const contact = await db.select().from(contactsTable).where(and(eq(contactsTable.id, contactId), eq(contactsTable.clientId, clientId))).limit(1);
      if (!contact[0]) { results.push({ contactId, success: false, error: "not found" }); continue; }
      const config = await ensureClientConfig(clientId);

      const inserted = await db.insert(callsTable).values({ clientId, contactId, contactName: contact[0].name, contactPhone: contact[0].phone, status: "queued" }).returning();
      const callRecord = inserted[0];

      const replitDomain = process.env.REPLIT_DEV_DOMAIN;
      const webhookUrl = replitDomain ? `https://${replitDomain}/api/calls/webhook` : null;
      const blandPayload: Record<string, unknown> = {
        phone_number: contact[0].phone, task: config.prompt, voice: config.voice,
        first_sentence: config.firstMessage, max_duration: config.maxDuration,
        record: true, metadata: { call_db_id: callRecord.id, contact_id: contactId, client_id: clientId },
      };
      if (webhookUrl) blandPayload.webhook = webhookUrl;

      const blandRes = await fetch(`${BLAND_BASE_URL}/calls`, { method: "POST", headers: { Authorization: BLAND_API_KEY!, "Content-Type": "application/json" }, body: JSON.stringify(blandPayload) });
      if (blandRes.ok) {
        const blandData = (await blandRes.json()) as { call_id?: string };
        await db.update(callsTable).set({ blandCallId: blandData.call_id, status: "in-progress", startedAt: new Date() }).where(eq(callsTable.id, callRecord.id));
        await db.update(contactsTable).set({ lastCalledAt: new Date(), status: "contacted" }).where(eq(contactsTable.id, contactId));
        results.push({ contactId, success: true, callId: callRecord.id });
      } else {
        await db.update(callsTable).set({ status: "failed" }).where(eq(callsTable.id, callRecord.id));
        results.push({ contactId, success: false, error: "BlandAI error" });
      }
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      results.push({ contactId, success: false, error: err instanceof Error ? err.message : "unknown" });
    }
  }
  res.json({ results, succeeded: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length });
});

// ── BOOKINGS ──────────────────────────────────────────────────────────────────

router.get("/admin/clients/:id/bookings", async (req, res) => {
  const clientId = Number(req.params.id);
  const bookings = await db.select().from(bookingsTable).where(eq(bookingsTable.clientId, clientId)).orderBy(desc(bookingsTable.scheduledAt));
  res.json(bookings.map(serializeBooking));
});

router.post("/admin/clients/:id/bookings", async (req, res) => {
  const clientId = Number(req.params.id);
  const { contactName, contactPhone, contactId, callId, scheduledAt, notes } = req.body as { contactName?: string; contactPhone?: string; contactId?: number; callId?: number; scheduledAt: string; notes?: string };
  if (!scheduledAt) { res.status(400).json({ error: "scheduledAt required" }); return; }
  const inserted = await db.insert(bookingsTable).values({ clientId, contactName, contactPhone, contactId, callId, scheduledAt: new Date(scheduledAt), notes, status: "confirmed" }).returning();
  res.status(201).json(serializeBooking(inserted[0]));
});

router.patch("/admin/clients/:id/bookings/:bookingId", async (req, res) => {
  const id = Number(req.params.bookingId);
  const { status, scheduledAt, notes } = req.body as { status?: string; scheduledAt?: string; notes?: string };
  const updated = await db.update(bookingsTable).set({ ...(status && { status }), ...(scheduledAt && { scheduledAt: new Date(scheduledAt) }), ...(notes !== undefined && { notes }), updatedAt: new Date() }).where(eq(bookingsTable.id, id)).returning();
  if (!updated[0]) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeBooking(updated[0]));
});

router.delete("/admin/clients/:id/bookings/:bookingId", async (req, res) => {
  await db.update(bookingsTable).set({ status: "cancelled", updatedAt: new Date() }).where(eq(bookingsTable.id, Number(req.params.bookingId)));
  res.json({ ok: true });
});

// ── GLOBAL CALLS FEED ─────────────────────────────────────────────────────────

router.get("/admin/calls", async (_req, res) => {
  const calls = await db.select().from(callsTable).orderBy(desc(callsTable.createdAt)).limit(200);
  const clients = await db.select().from(clientsTable);
  const clientMap = new Map(clients.map(c => [c.id, c.name]));
  res.json(calls.map(c => ({ ...serializeCall(c), clientName: c.clientId ? (clientMap.get(c.clientId) ?? null) : null })));
});

// ── ADMIN STATS ───────────────────────────────────────────────────────────────

router.get("/admin/stats", async (_req, res) => {
  const [allClients, allCalls] = await Promise.all([
    db.select().from(clientsTable),
    db.select().from(callsTable),
  ]);
  res.json({
    totalClients: allClients.length,
    activeClients: allClients.filter(c => c.isActive).length,
    totalCalls: allCalls.length,
    completedCalls: allCalls.filter(c => c.status === "completed").length,
  });
});

export default router;
