import { Router } from "express";
import { eq, desc, and, isNull, inArray } from "drizzle-orm";
import crypto from "crypto";
import {
  db, clientsTable, contactsTable, callsTable, bookingsTable,
  agentConfigTable, availabilityTable,
} from "@workspace/db";
import { adminAuth } from "../middlewares/admin-auth";
import Anthropic from "@anthropic-ai/sdk";
import { computeSlots, getNextAvailableDays, formatSlotsForPrompt, REQUIRED_FIELDS_DIRECTIVE, getClientPublicToken, formatBusinessHoursForPrompt } from "../lib/availability-slots";

const router = Router();
router.use(adminAuth);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Claude sometimes wraps JSON in ```json ... ``` — strip fences before parsing
function parseClaudeJSON<T>(text: string): T {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  return JSON.parse(stripped) as T;
}
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
  const { name, businessType, phone, isActive, portalPassword, calUsername, calEventId } = req.body as { name?: string; businessType?: string; phone?: string; isActive?: boolean; portalPassword?: string; calUsername?: string; calEventId?: string };
  const updated = await db.update(clientsTable).set({
    ...(name && { name }),
    ...(businessType !== undefined && { businessType }),
    ...(phone !== undefined && { phone }),
    ...(isActive !== undefined && { isActive }),
    ...(portalPassword !== undefined && { portalPassword: portalPassword || null }),
    ...(calUsername !== undefined && { calUsername: calUsername || null }),
    ...(calEventId !== undefined && { calEventId: calEventId || null }),
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

// ── POST /admin/clients/:id/regenerate-token — issue a fresh access token ──
router.post("/admin/clients/:id/regenerate-token", async (req, res) => {
  const id = Number(req.params.id);
  const newToken = crypto.randomUUID().replace(/-/g, "");
  const updated = await db.update(clientsTable).set({ accessToken: newToken, updatedAt: new Date() }).where(eq(clientsTable.id, id)).returning();
  if (!updated[0]) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeClient(updated[0]));
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
  const { timezone, notificationEmail, availableDays, startTime, endTime, slotDurationMinutes, preventOverlaps } = req.body as {
    timezone?: string; notificationEmail?: string | null; availableDays?: number[]; startTime?: string; endTime?: string; slotDurationMinutes?: number; preventOverlaps?: boolean;
  };
  const updated = await db.update(availabilityTable).set({
    ...(timezone && { timezone }),
    ...(notificationEmail !== undefined && { notificationEmail }),
    ...(availableDays && { availableDays: JSON.stringify(availableDays) }),
    ...(startTime && { startTime }),
    ...(endTime && { endTime }),
    ...(slotDurationMinutes && { slotDurationMinutes }),
    ...(preventOverlaps !== undefined && { preventOverlaps }),
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

// ── PATCH /admin/clients/:id/calls/:callId — update call fields (contactName, notes, etc.) ──
router.patch("/admin/clients/:id/calls/:callId", async (req, res) => {
  const clientId = Number(req.params.id);
  const callId = Number(req.params.callId);
  const { contactName, status, notes } = req.body as { contactName?: string; status?: string; notes?: string };
  const updateData: Record<string, unknown> = {};
  if (contactName !== undefined) updateData.contactName = contactName;
  if (status !== undefined) updateData.status = status;
  if (notes !== undefined) updateData.notes = notes;
  if (Object.keys(updateData).length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }
  const updated = await db.update(callsTable).set(updateData as Partial<typeof callsTable.$inferSelect>)
    .where(and(eq(callsTable.id, callId), eq(callsTable.clientId, clientId))).returning();
  if (!updated[0]) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeCall(updated[0]));
});

// ── POST /admin/clients/:id/calls/:callId/analyze — re-run AI analysis on a completed call ──
router.post("/admin/clients/:id/calls/:callId/analyze", async (req, res) => {
  const clientId = Number(req.params.id);
  const callId = Number(req.params.callId);
  const calls = await db.select().from(callsTable).where(and(eq(callsTable.id, callId), eq(callsTable.clientId, clientId))).limit(1);
  const call = calls[0];
  if (!call) { res.status(404).json({ error: "Call not found" }); return; }

  const analysisText = call.transcript || call.summary;
  if (!analysisText) { res.status(400).json({ error: "No transcript or summary to analyze" }); return; }

  const updateData: Record<string, unknown> = {};

  // AI summary + key insights + lead score
  try {
    const aiResp = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: `Analyze this phone call. Extract:\n1. A 1-2 sentence SUMMARY.\n2. Up to 4 KEY INSIGHTS (5-8 words each).\n3. LEAD SCORE: "Hot", "Warm", or "Cold".\nRespond ONLY with JSON: {"summary":"...","keyInsights":["..."],"leadScore":"Hot"}\n\nCALL:\n${analysisText.slice(0, 3000)}` }],
    });
    const textBlock = aiResp.content.find(b => b.type === "text");
    if (textBlock && textBlock.type === "text") {
      const parsed = parseClaudeJSON<{ summary?: string; keyInsights?: string[]; leadScore?: string }>(textBlock.text);
      if (parsed.summary) updateData.summary = parsed.summary;
      if (Array.isArray(parsed.keyInsights) && parsed.keyInsights.length > 0) updateData.keyInsights = JSON.stringify(parsed.keyInsights.slice(0, 4));
      if (parsed.leadScore && ["Hot","Warm","Cold"].includes(parsed.leadScore)) updateData.leadScore = parsed.leadScore;
    }
  } catch (err) { console.error("[analyze] AI summary failed:", err); }

  // Extract booking if none exists for this call
  const existingBooking = await db.select().from(bookingsTable).where(eq(bookingsTable.callId, callId)).limit(1);
  let bookingCreated = false;
  if (!existingBooking[0]) {
    try {
      const bookingResp = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 256,
        messages: [{ role: "user", content: `Did this phone call result in a confirmed appointment/booking?\nIf YES, extract the date+time as ISO 8601 (today is ${new Date().toISOString().slice(0, 10)}).\nIf NO confirmed appointment, return null.\nRespond ONLY with JSON: {"scheduledAt":"2026-06-26T19:00:00.000Z","notes":"..."} or {"scheduledAt":null}\n\nCALL:\n${analysisText.slice(0, 2000)}` }],
      });
      const bBlock = bookingResp.content.find(b => b.type === "text");
      if (bBlock && bBlock.type === "text") {
        const bp = parseClaudeJSON<{ scheduledAt?: string | null; notes?: string }>(bBlock.text);
        if (bp.scheduledAt) {
          const scheduledAt = new Date(bp.scheduledAt);
          if (!isNaN(scheduledAt.getTime())) {
            await db.insert(bookingsTable).values({
              clientId, contactId: call.contactId ?? undefined,
              contactName: call.contactName, contactPhone: call.contactPhone,
              callId, scheduledAt, notes: bp.notes ?? null, status: "confirmed",
            });
            bookingCreated = true;
          }
        }
      }
    } catch (err) { console.error("[analyze] Booking extraction failed:", err); }
  }

  if (Object.keys(updateData).length > 0) {
    await db.update(callsTable).set(updateData as Partial<typeof callsTable.$inferSelect>).where(eq(callsTable.id, callId));
  }

  const updated = await db.select().from(callsTable).where(eq(callsTable.id, callId)).limit(1);
  res.json({ call: serializeCall(updated[0]), bookingCreated });
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

  const serverUrl = process.env.SERVER_URL;
  const webhookUrl = serverUrl ? `${serverUrl}/api/calls/webhook` : null;

  let task = config.qualificationCriteria?.trim()
    ? `${config.prompt}\n\nQualification Criteria:\n${config.qualificationCriteria}`
    : config.prompt;
  console.log(`[admin/initiate] Base task length=${task.length} chars, qualificationCriteria="${config.qualificationCriteria?.slice(0, 60) ?? "none"}"`);
  const avail = await ensureClientAvailability(clientId);
  console.log(`[admin/initiate] Availability: preventOverlaps=${avail.preventOverlaps} timezone=${avail.timezone}`);
  const initiateBlandTools: unknown[] = [];
  if (serverUrl) {
    const clientToken = getClientPublicToken(clientId);
    const hoursLine = formatBusinessHoursForPrompt(avail);
    task = `${task}\n\n${hoursLine}\n\nBefore offering or confirming any appointment time, you MUST call the check_availability tool with the requested date in YYYY-MM-DD format to get real-time available slots. Never confirm a time without first checking availability.`;
    initiateBlandTools.push({
      name: "check_availability",
      description: "Check available appointment slots for a specific date. Always call this before offering or confirming any appointment time.",
      url: `${serverUrl}/api/availability/${clientToken}/slots`,
      method: "GET",
      headers: {},
      query: { date: "{{date}}" },
      response_data: [
        { name: "available_slots", data: "$.slots", context: "Available appointment times for the requested date" },
        { name: "timezone", data: "$.timezone", context: "Timezone for the slots" },
        { name: "business_hours", data: "$.business_hours", context: "Business operating hours" },
      ],
      input_schema: {
        speech: "Let me check available times for that date.",
        type: "object",
        properties: {
          date: { type: "string", description: "Date in YYYY-MM-DD format (e.g. 2026-06-27)" },
        },
        required: ["date"],
      },
    });
    console.log(`[admin/initiate] BlandAI tool 'check_availability' registered at ${serverUrl}/api/availability/${clientToken}/slots`);
  } else {
    // Fallback: static injection when SERVER_URL not set
    const nextDays = getNextAvailableDays(5, avail);
    const allSlots: Date[] = [];
    for (const day of nextDays) { allSlots.push(...await computeSlots(clientId, day, avail)); }
    const slotsText = formatSlotsForPrompt(allSlots, avail.timezone, avail);
    if (slotsText) { task = `${task}\n\n${slotsText}`; }
    console.log(`[admin/initiate] SERVER_URL not set — static fallback (${allSlots.length} slots)`);
  }
  task = `${task}\n\n${REQUIRED_FIELDS_DIRECTIVE}`;
  console.log(`[admin/initiate] SERVER_URL="${serverUrl ?? "NOT SET"}" webhookUrl="${webhookUrl ?? "NONE — poller will sync instead"}"`);
  console.log(`[admin/initiate] Full task being sent to BlandAI:\n---\n${task}\n---`);
  const blandPayload: Record<string, unknown> = {
    phone_number: contact[0].phone, task, voice: config.voice,
    first_sentence: config.firstMessage, max_duration: config.maxDuration,
    record: true, answered_by_enabled: true,
    metadata: { call_db_id: callRecord.id, contact_id: contactId, client_id: clientId },
  };
  if (webhookUrl) blandPayload.webhook = webhookUrl;
  if (initiateBlandTools.length > 0) blandPayload.tools = initiateBlandTools;

  const blandRes = await fetch(`${BLAND_BASE_URL}/calls`, {
    method: "POST",
    headers: { Authorization: BLAND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(blandPayload),
  });

  const blandRawText = await blandRes.text();
  console.log(`[admin/initiate] BlandAI response status=${blandRes.status} body=${blandRawText.slice(0, 500)}`);
  if (!blandRes.ok) {
    await db.update(callsTable).set({ status: "failed" }).where(eq(callsTable.id, callRecord.id));
    res.status(502).json({ error: "BlandAI error", detail: blandRawText.slice(0, 200) }); return;
  }

  const blandData = JSON.parse(blandRawText) as { call_id?: string; c_id?: string; id?: string };
  const blandCallId = blandData.call_id ?? blandData.c_id ?? blandData.id ?? null;
  console.log(`[admin/initiate] blandCallId=${blandCallId} — saving to call record id=${callRecord.id}`);
  await db.update(callsTable).set({ blandCallId, status: "in-progress", startedAt: new Date() }).where(eq(callsTable.id, callRecord.id));
  await db.update(contactsTable).set({ lastCalledAt: new Date(), status: "contacted" }).where(eq(contactsTable.id, contactId));

  res.status(201).json(serializeCall(callRecord));
});

// ── POST /admin/clients/:id/calls/sync — poll BlandAI for stuck in-progress calls ──
router.post("/admin/clients/:id/calls/sync", async (req, res) => {
  const clientId = Number(req.params.id);
  if (!BLAND_API_KEY) { res.json({ synced: 0 }); return; }

  const inProgress = await db.select().from(callsTable)
    .where(and(eq(callsTable.clientId, clientId),
      inArray(callsTable.status, ["in-progress", "queued"])))
    .limit(20);

  let synced = 0;
  for (const call of inProgress) {
    try {
      let blandId = call.blandCallId;

      // If no blandCallId stored, search BlandAI by metadata
      if (!blandId) {
        const listRes = await fetch(`${BLAND_BASE_URL}/calls?limit=50`, {
          headers: { Authorization: BLAND_API_KEY },
        });
        if (listRes.ok) {
          const listData = (await listRes.json()) as { calls?: Array<{ c_id?: string; call_id?: string; metadata?: { call_db_id?: number } }> };
          const match = listData.calls?.find(c => c.metadata?.call_db_id === call.id);
          if (match) blandId = match.c_id ?? match.call_id ?? null;
        }
      }

      if (!blandId) continue;

      const bRes = await fetch(`${BLAND_BASE_URL}/calls/${blandId}`, {
        headers: { Authorization: BLAND_API_KEY },
      });
      if (!bRes.ok) continue;

      const data = (await bRes.json()) as {
        status?: string; completed?: boolean; queue_status?: string;
        transcript?: string | Array<{ user: string; text: string }>;
        summary?: string; call_length?: number; error_message?: string;
      };

      const isCompleted = data.completed === true || data.status === "completed" || data.queue_status === "complete";
      const isFailed = data.status === "failed" || !!data.error_message;
      if (!isCompleted && !isFailed) continue;

      const updateData: Record<string, unknown> = {
        blandCallId: blandId,
        status: isCompleted ? "completed" : "failed",
        endedAt: new Date(),
      };
      // BlandAI call_length is in minutes — convert to seconds
      if (data.call_length) updateData.durationSeconds = Math.round(data.call_length * 60);

      let transcriptText: string | undefined;
      if (data.transcript) {
        transcriptText = typeof data.transcript === "string"
          ? data.transcript
          : (data.transcript as Array<{ user: string; text: string }>)
              .filter(t => t.text?.trim())
              .map(t => `${t.user}: ${t.text}`)
              .join("\n");
        if (transcriptText.trim()) updateData.transcript = transcriptText;
      }
      if (data.summary) updateData.summary = data.summary;

      // Text to analyze — prefer full transcript, fall back to BlandAI summary
      const analysisText = transcriptText?.trim() || data.summary || null;

      if (isCompleted && analysisText) {
        // AI summary + key insights + lead score
        if (!call.keyInsights) {
          try {
            const aiResp = await anthropic.messages.create({
              model: "claude-haiku-4-5",
              max_tokens: 1024,
              messages: [{ role: "user", content: `Analyze this phone call. Extract:\n1. A 1-2 sentence SUMMARY.\n2. Up to 4 KEY INSIGHTS (5-8 words each).\n3. LEAD SCORE: "Hot", "Warm", or "Cold".\nRespond ONLY with JSON: {"summary":"...","keyInsights":["..."],"leadScore":"Hot"}\n\nCALL:\n${analysisText.slice(0, 3000)}` }],
            });
            const textBlock = aiResp.content.find(b => b.type === "text");
            if (textBlock && textBlock.type === "text") {
              const parsed = parseClaudeJSON<{ summary?: string; keyInsights?: string[]; leadScore?: string }>(textBlock.text);
              if (parsed.summary) updateData.summary = parsed.summary;
              if (Array.isArray(parsed.keyInsights) && parsed.keyInsights.length > 0) updateData.keyInsights = JSON.stringify(parsed.keyInsights.slice(0, 4));
              if (parsed.leadScore && ["Hot","Warm","Cold"].includes(parsed.leadScore)) updateData.leadScore = parsed.leadScore;
            }
          } catch { /* skip if Claude fails */ }
        }

        // Extract booking if none already exists for this call
        try {
          const existingBooking = await db.select().from(bookingsTable).where(eq(bookingsTable.callId, call.id)).limit(1);
          if (!existingBooking[0]) {
            const bookingResp = await anthropic.messages.create({
              model: "claude-haiku-4-5",
              max_tokens: 256,
              messages: [{ role: "user", content: `Did this phone call result in a confirmed appointment/booking?\nIf YES, extract the date+time as ISO 8601 (today is ${new Date().toISOString().slice(0, 10)}).\nIf NO appointment was confirmed, return null.\nRespond ONLY with JSON: {"scheduledAt":"2026-06-26T19:00:00.000Z","notes":"..."} or {"scheduledAt":null}\n\nCALL:\n${analysisText.slice(0, 2000)}` }],
            });
            const bBlock = bookingResp.content.find(b => b.type === "text");
            if (bBlock && bBlock.type === "text") {
              const bp = parseClaudeJSON<{ scheduledAt?: string | null; notes?: string }>(bBlock.text);
              if (bp.scheduledAt) {
                const scheduledAt = new Date(bp.scheduledAt);
                if (!isNaN(scheduledAt.getTime())) {
                  await db.insert(bookingsTable).values({
                    clientId,
                    contactId: call.contactId ?? undefined,
                    contactName: call.contactName,
                    contactPhone: call.contactPhone,
                    callId: call.id,
                    scheduledAt,
                    notes: bp.notes ?? null,
                    status: "confirmed",
                  });
                  console.log(`[sync] Auto-created booking for call ${call.id} at ${scheduledAt.toISOString()}`);
                }
              }
            }
          }
        } catch { /* skip booking extraction if it fails */ }
      }

      await db.update(callsTable).set(updateData as Partial<typeof callsTable.$inferSelect>).where(eq(callsTable.id, call.id));
      synced++;
      console.log(`[sync] Updated call ${call.id} → ${updateData.status}`);
    } catch (err) {
      console.error(`[sync] Error syncing call ${call.id}:`, err);
    }
  }

  res.json({ synced, checked: inProgress.length });
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

      const bulkServerUrl = process.env.SERVER_URL;
      const webhookUrl = bulkServerUrl ? `${bulkServerUrl}/api/calls/webhook` : null;
      let bulkTask = config.qualificationCriteria?.trim()
        ? `${config.prompt}\n\nQualification Criteria:\n${config.qualificationCriteria}`
        : config.prompt;
      const bulkAvail = await ensureClientAvailability(clientId);
      console.log(`[admin/bulk] contactId=${contactId} preventOverlaps=${bulkAvail.preventOverlaps} webhookUrl="${webhookUrl ?? "NONE"}"`);
      const bulkBlandTools: unknown[] = [];
      if (bulkServerUrl) {
        const clientToken = getClientPublicToken(clientId);
        const hoursLine = formatBusinessHoursForPrompt(bulkAvail);
        bulkTask = `${bulkTask}\n\n${hoursLine}\n\nBefore offering or confirming any appointment time, you MUST call the check_availability tool with the requested date in YYYY-MM-DD format to get real-time available slots. Never confirm a time without first checking availability.`;
        bulkBlandTools.push({
          name: "check_availability",
          description: "Check available appointment slots for a specific date. Always call this before offering or confirming any appointment time.",
          url: `${bulkServerUrl}/api/availability/${clientToken}/slots`,
          method: "GET",
          headers: {},
          query: { date: "{{date}}" },
          response_data: [
            { name: "available_slots", data: "$.slots", context: "Available appointment times for the requested date" },
            { name: "timezone", data: "$.timezone", context: "Timezone for the slots" },
            { name: "business_hours", data: "$.business_hours", context: "Business operating hours" },
          ],
          input_schema: {
            speech: "Let me check available times for that date.",
            type: "object",
            properties: {
              date: { type: "string", description: "Date in YYYY-MM-DD format (e.g. 2026-06-27)" },
            },
            required: ["date"],
          },
        });
        console.log(`[admin/bulk] contactId=${contactId} BlandAI tool 'check_availability' registered`);
      } else {
        const bulkNextDays = getNextAvailableDays(5, bulkAvail);
        const allBulkSlots: Date[] = [];
        for (const day of bulkNextDays) { allBulkSlots.push(...await computeSlots(clientId, day, bulkAvail)); }
        const slotsText = formatSlotsForPrompt(allBulkSlots, bulkAvail.timezone, bulkAvail);
        if (slotsText) { bulkTask = `${bulkTask}\n\n${slotsText}`; }
        console.log(`[admin/bulk] contactId=${contactId} SERVER_URL not set — static fallback (${allBulkSlots.length} slots)`);
      }
      bulkTask = `${bulkTask}\n\n${REQUIRED_FIELDS_DIRECTIVE}`;
      console.log(`[admin/bulk] Full task for contactId=${contactId}:\n---\n${bulkTask}\n---`);
      const blandPayload: Record<string, unknown> = {
        phone_number: contact[0].phone, task: bulkTask, voice: config.voice,
        first_sentence: config.firstMessage, max_duration: config.maxDuration,
        record: true, metadata: { call_db_id: callRecord.id, contact_id: contactId, client_id: clientId },
      };
      if (webhookUrl) blandPayload.webhook = webhookUrl;
      if (bulkBlandTools.length > 0) blandPayload.tools = bulkBlandTools;

      const blandRes = await fetch(`${BLAND_BASE_URL}/calls`, { method: "POST", headers: { Authorization: BLAND_API_KEY!, "Content-Type": "application/json" }, body: JSON.stringify(blandPayload) });
      if (blandRes.ok) {
        const blandData = (await blandRes.json()) as { call_id?: string; c_id?: string; id?: string };
        const blandCallId = blandData.call_id ?? blandData.c_id ?? blandData.id ?? null;
        await db.update(callsTable).set({ blandCallId, status: "in-progress", startedAt: new Date() }).where(eq(callsTable.id, callRecord.id));
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
  const [bookings, availRows] = await Promise.all([
    db.select().from(bookingsTable).where(eq(bookingsTable.clientId, clientId)).orderBy(desc(bookingsTable.scheduledAt)),
    db.select().from(availabilityTable).where(eq(availabilityTable.clientId, clientId)).limit(1),
  ]);
  const timezone = availRows[0]?.timezone ?? null;
  res.json(bookings.map(b => ({ ...serializeBooking(b), timezone })));
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

// ── ADMIN CHAT (AI call assistant) ────────────────────────────────────────────

router.post("/admin/chat", async (req, res) => {
  const { clientId, message, history = [] } = req.body as {
    clientId: number;
    message: string;
    history: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!message) { res.status(400).json({ error: "message is required" }); return; }
  if (!clientId) { res.status(400).json({ error: "clientId is required" }); return; }

  const [contacts, recentCalls, config, client] = await Promise.all([
    db.select().from(contactsTable).where(eq(contactsTable.clientId, clientId)).orderBy(contactsTable.createdAt),
    db.select().from(callsTable).where(eq(callsTable.clientId, clientId)).orderBy(desc(callsTable.createdAt)).limit(5),
    ensureClientConfig(clientId),
    db.select().from(clientsTable).where(eq(clientsTable.id, clientId)).limit(1).then(r => r[0]),
  ]);

  if (!client) { res.status(404).json({ error: "Client not found" }); return; }

  const contactList = contacts.length
    ? contacts.map(c => `- ID ${c.id}: ${c.name} | ${c.phone}${c.company ? ` | ${c.company}` : ""}${c.email ? ` | ${c.email}` : ""} | status: ${c.status}`).join("\n")
    : "No contacts yet.";

  const recentCallList = recentCalls.length
    ? recentCalls.map(c => `- ${c.contactName ?? c.contactPhone} | ${c.status} | ${c.createdAt.toLocaleDateString()}`).join("\n")
    : "No calls yet.";

  const systemPrompt = `You are a smart call assistant for Callvance, an AI-powered outbound calling platform. You are currently managing the account for: ${client.name} (${client.businessType ?? "business"}).

Help the admin trigger test calls and check call history. Be concise and direct.

When the admin asks to call someone, use the initiate_call tool. Match a name to the contact list if possible, or use phone_number for a raw number. Include custom_topic if they describe a specific script or topic.

## ${client.name}'s Contacts
${contactList}

## Recent Calls
${recentCallList}

## Agent Config
Name: ${config.agentName} | Voice: ${config.voice} | Max: ${config.maxDuration}s

Rules:
- Match names to contacts and call via contact_id. Use phone_number for raw numbers.
- Include custom_topic if a specific topic or script is mentioned.
- If contact not found, suggest adding them in the Contacts tab, or offer to call a raw number.
- Keep responses short (1–3 sentences).`;

  const tools: Anthropic.Tool[] = [{
    name: "initiate_call",
    description: "Initiate an outbound AI voice call for this client. Use contact_id for an existing contact or phone_number for a new number. Optionally pass custom_topic to override the agent's default script.",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_id: { type: "number", description: "ID of an existing contact" },
        phone_number: { type: "string", description: "Raw phone number when no contact exists" },
        custom_topic: { type: "string", description: "Custom instructions for this specific call" },
      },
    },
  }];

  try {
    console.log(`[chat] ── NEW REQUEST ── clientId=${clientId} message="${message.slice(0, 120)}" historyLen=${history.length} contacts=${contacts.length}`);

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages: [
        ...history.map(h => ({ role: h.role, content: h.content })),
        { role: "user", content: message },
      ],
    });

    console.log(`[chat] Claude response: stop_reason="${response.stop_reason}" content_blocks=${response.content.length} [${response.content.map(b => b.type + (b.type === "tool_use" ? `(${(b as Anthropic.ToolUseBlock).name})` : "")).join(", ")}]`);

    const toolUse = response.content.find(b => b.type === "tool_use");

    if (!toolUse) {
      const textBlocks = response.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join(" ");
      console.log(`[chat] No tool_use block — Claude replied with text only: "${textBlocks.slice(0, 200)}"`);
    }

    if (toolUse && toolUse.type === "tool_use" && toolUse.name === "initiate_call") {
      const input = toolUse.input as { contact_id?: number; phone_number?: string; custom_topic?: string };
      console.log(`[chat] ✓ Claude invoked initiate_call: contact_id=${input.contact_id ?? "none"} phone_number="${input.phone_number ?? "none"}" custom_topic="${input.custom_topic?.slice(0, 80) ?? "none"}"`);

      let callResult: { success: boolean; message: string; call?: object } = { success: false, message: "Call failed." };

      try {
        let contactPhone: string | undefined = input.phone_number;
        let contactName: string | undefined;
        let contactDbId: number | undefined = input.contact_id;

        if (contactDbId) {
          const contact = contacts.find(c => c.id === contactDbId);
          if (!contact) {
            console.log(`[chat] ✗ Contact ID ${contactDbId} not found in contacts list (${contacts.length} contacts for clientId=${clientId})`);
            callResult = { success: false, message: `Contact ID ${contactDbId} not found in this client's contacts.` };
          } else {
            contactPhone = contact.phone;
            contactName = contact.name;
            console.log(`[chat] ✓ Resolved contact_id=${contactDbId} → name="${contactName}" phone="${contactPhone}"`);
          }
        }

        if (!contactPhone) {
          console.log(`[chat] ✗ No phone number available — contact_id=${contactDbId ?? "none"} phone_number="${input.phone_number ?? "none"}"`);
        }

        if (contactPhone && !callResult.message.includes("not found")) {
          if (!BLAND_API_KEY) {
            console.log(`[chat] ✗ BLAND_AI_API_KEY is not configured`);
            callResult = { success: false, message: "BlandAI API key not configured." };
          } else {
            const basePrompt = config.prompt ?? "You are a helpful AI assistant.";
            const promptWithCriteria = config.qualificationCriteria?.trim()
              ? `${basePrompt}\n\nQualification Criteria:\n${config.qualificationCriteria}`
              : basePrompt;
            const withTopic = input.custom_topic
              ? `${promptWithCriteria}\n\nIMPORTANT — Special instructions for this call: ${input.custom_topic}`
              : promptWithCriteria;

            // Build availability tool or fall back to static injection
            const chatAvailRows = await db.select().from(availabilityTable).where(eq(availabilityTable.clientId, clientId)).limit(1);
            const chatAvail = chatAvailRows[0];
            let effectiveTask = withTopic;
            const chatBlandTools: unknown[] = [];
            const chatServerUrl = process.env.SERVER_URL;
            if (chatAvail && chatServerUrl) {
              const clientToken = getClientPublicToken(clientId);
              const hoursLine = formatBusinessHoursForPrompt(chatAvail);
              effectiveTask = `${withTopic}\n\n${hoursLine}\n\nBefore offering or confirming any appointment time, you MUST call the check_availability tool with the requested date in YYYY-MM-DD format to get real-time available slots. Never confirm a time without first checking availability.`;
              chatBlandTools.push({
                name: "check_availability",
                description: "Check available appointment slots for a specific date. Always call this before offering or confirming any appointment time.",
                url: `${chatServerUrl}/api/availability/${clientToken}/slots`,
                method: "GET",
                headers: {},
                query: { date: "{{date}}" },
                response_data: [
                  { name: "available_slots", data: "$.slots", context: "Available appointment times for the requested date" },
                  { name: "timezone", data: "$.timezone", context: "Timezone for the slots" },
                  { name: "business_hours", data: "$.business_hours", context: "Business operating hours" },
                ],
                input_schema: {
                  speech: "Let me check available times for that date.",
                  type: "object",
                  properties: {
                    date: { type: "string", description: "Date in YYYY-MM-DD format (e.g. 2026-06-27)" },
                  },
                  required: ["date"],
                },
              });
              console.log(`[chat-initiate] BlandAI tool 'check_availability' registered for clientId=${clientId}`);
            } else if (chatAvail) {
              // Static fallback when SERVER_URL not set
              const nextDays = getNextAvailableDays(5, chatAvail);
              const allSlots: Date[] = [];
              for (const day of nextDays) { allSlots.push(...await computeSlots(clientId, day, chatAvail)); }
              const slotsText = formatSlotsForPrompt(allSlots, chatAvail.timezone, chatAvail);
              if (slotsText) { effectiveTask = `${withTopic}\n\n${slotsText}`; }
              console.log(`[chat-initiate] SERVER_URL not set — static fallback (${allSlots.length} slots)`);
            } else {
              console.log(`[chat-initiate] No availability row for clientId=${clientId}`);
            }
            const effectivePrompt = `${effectiveTask}\n\n${REQUIRED_FIELDS_DIRECTIVE}`;

            const inserted = await db.insert(callsTable).values({
              clientId, contactId: contactDbId ?? null, contactName: contactName ?? null, contactPhone, status: "queued",
            }).returning();
            const callRecord = inserted[0];

            const webhookUrl = chatServerUrl ? `${chatServerUrl}/api/calls/webhook` : null;

            const blandPayload: Record<string, unknown> = {
              phone_number: contactPhone, task: effectivePrompt, voice: config.voice,
              first_sentence: config.firstMessage, max_duration: config.maxDuration,
              record: true, answered_by_enabled: true,
              metadata: { call_db_id: callRecord.id, contact_id: contactDbId, client_id: clientId },
            };
            if (webhookUrl) blandPayload.webhook = webhookUrl;
            if (chatBlandTools.length > 0) blandPayload.tools = chatBlandTools;

            console.log(`[chat-initiate] Task string length=${effectivePrompt.length} blandTools=${chatBlandTools.length} webhookUrl="${webhookUrl ?? "NONE"}" phone="${contactPhone}"`);
            console.log(`[chat-initiate] FULL TASK STRING SENT TO BLANDAI:\n---\n${effectivePrompt}\n---`);
            console.log(`[chat-initiate] Sending POST to BlandAI ${BLAND_BASE_URL}/calls ...`);
            const blandRes = await fetch(`${BLAND_BASE_URL}/calls`, {
              method: "POST",
              headers: { Authorization: BLAND_API_KEY, "Content-Type": "application/json" },
              body: JSON.stringify(blandPayload),
            });

            console.log(`[chat-initiate] BlandAI HTTP status: ${blandRes.status} ${blandRes.statusText}`);
            if (blandRes.ok) {
              const blandData = (await blandRes.json()) as { call_id?: string; c_id?: string; id?: string };
              const blandCallId = blandData.call_id ?? blandData.c_id ?? blandData.id ?? null;
              console.log(`[chat-initiate] ✓ BlandAI accepted call. call_id="${blandCallId}" raw=${JSON.stringify(blandData).slice(0, 300)}`);
              await db.update(callsTable).set({ blandCallId, status: "in-progress", startedAt: new Date() }).where(eq(callsTable.id, callRecord.id));
              if (contactDbId) await db.update(contactsTable).set({ lastCalledAt: new Date(), status: "contacted" }).where(eq(contactsTable.id, contactDbId));
              callResult = { success: true, message: `Call to ${contactName ?? contactPhone} initiated.`, call: { id: callRecord.id, phone: contactPhone, name: contactName } };
            } else {
              const errBody = await blandRes.text();
              console.log(`[chat-initiate] ✗ BlandAI rejected call. status=${blandRes.status} body="${errBody.slice(0, 300)}"`);
              await db.update(callsTable).set({ status: "failed" }).where(eq(callsTable.id, callRecord.id));
              callResult = { success: false, message: `BlandAI error (${blandRes.status}): ${errBody}` };
            }
          }
        }
      } catch (err) {
        console.error("[chat] ✗ Exception during call initiation:", err);
        callResult = { success: false, message: "Internal error while initiating call." };
      }

      console.log(`[chat] callResult: success=${callResult.success} message="${callResult.message}"`);

      const followUp = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 512,
        system: systemPrompt,
        tools,
        messages: [
          ...history.map(h => ({ role: h.role, content: h.content })),
          { role: "user", content: message },
          { role: "assistant", content: response.content },
          { role: "user", content: [{ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(callResult) }] },
        ],
      });

      const replyText = followUp.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("");
      console.log(`[chat] ── RESPONSE ── callInitiated=${callResult.success} reply="${replyText.slice(0, 120)}"`);
      res.json({ message: replyText || (callResult.success ? "Call initiated." : callResult.message), callInitiated: callResult.success, call: (callResult as { call?: object }).call });
      return;
    }

    const replyText = response.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("");
    console.log(`[chat] ── RESPONSE ── callInitiated=false (no tool use) reply="${replyText.slice(0, 120)}"`);
    res.json({ message: replyText, callInitiated: false });
  } catch (err) {
    console.error("[chat] ✗ Unhandled error:", err);
    res.status(500).json({ error: "Failed to process message" });
  }
});

// ── GLOBAL CONTACTS FEED ──────────────────────────────────────────────────────

router.get("/admin/contacts", async (_req, res) => {
  const contacts = await db.select().from(contactsTable).orderBy(desc(contactsTable.createdAt)).limit(500);
  const clients = await db.select().from(clientsTable);
  const clientMap = new Map(clients.map(c => [c.id, c.name]));
  res.json(contacts.map(c => ({ ...serializeContact(c), clientName: c.clientId ? (clientMap.get(c.clientId) ?? null) : null })));
});

// ── GLOBAL BOOKINGS FEED ──────────────────────────────────────────────────────

router.get("/admin/bookings", async (_req, res) => {
  const bookings = await db.select().from(bookingsTable).orderBy(desc(bookingsTable.scheduledAt)).limit(200);
  const [clients, availRows] = await Promise.all([
    db.select().from(clientsTable),
    db.select().from(availabilityTable),
  ]);
  const clientMap = new Map(clients.map(c => [c.id, c.name]));
  const tzMap = new Map(availRows.map(a => [a.clientId, a.timezone]));
  res.json(bookings.map(b => ({
    ...serializeBooking(b),
    clientName: b.clientId ? (clientMap.get(b.clientId) ?? null) : null,
    timezone: b.clientId ? (tzMap.get(b.clientId) ?? null) : null,
  })));
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
