import { Router } from "express";
import { eq, desc, count, avg } from "drizzle-orm";
import { db, callsTable, contactsTable, agentConfigTable } from "@workspace/db";
import {
  InitiateCallBody,
  CallWebhookBody,
  GetCallParams,
} from "@workspace/api-zod";

const router = Router();

const BLAND_API_KEY = process.env.BLAND_AI_API_KEY;
const BLAND_BASE_URL = "https://api.bland.ai/v1";

function serializeCall(c: typeof callsTable.$inferSelect) {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    startedAt: c.startedAt ? c.startedAt.toISOString() : null,
    endedAt: c.endedAt ? c.endedAt.toISOString() : null,
  };
}

router.get("/calls", async (_req, res) => {
  const calls = await db
    .select()
    .from(callsTable)
    .orderBy(desc(callsTable.createdAt));
  res.json(calls.map(serializeCall));
});

router.get("/calls/stats/summary", async (_req, res) => {
  const allCalls = await db.select().from(callsTable);
  const totalContacts = await db.select({ count: count() }).from(contactsTable);

  const total = allCalls.length;
  const completed = allCalls.filter((c) => c.status === "completed").length;
  const failed = allCalls.filter((c) => c.status === "failed").length;
  const inProgress = allCalls.filter((c) => c.status === "in-progress").length;
  const durations = allCalls
    .filter((c) => c.durationSeconds != null)
    .map((c) => c.durationSeconds as number);
  const avgDurationSeconds =
    durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : null;

  res.json({
    total,
    completed,
    failed,
    inProgress,
    avgDurationSeconds,
    totalContacts: totalContacts[0]?.count ?? 0,
  });
});

router.post("/calls/initiate", async (req, res) => {
  const parsed = InitiateCallBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { contactId } = parsed.data;

  const contact = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.id, contactId))
    .limit(1);

  if (!contact[0]) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  const configRows = await db.select().from(agentConfigTable).limit(1);
  const config = configRows[0];

  if (!config) {
    res.status(500).json({ error: "Agent config not found" });
    return;
  }

  if (!BLAND_API_KEY) {
    res.status(500).json({ error: "BLAND_AI_API_KEY not configured" });
    return;
  }

  // Insert call record first
  const inserted = await db
    .insert(callsTable)
    .values({
      contactId: contact[0].id,
      contactName: contact[0].name,
      contactPhone: contact[0].phone,
      status: "queued",
    })
    .returning();
  const callRecord = inserted[0];

  // Get the webhook base URL from environment or Replit domain
  const replitDomain = process.env.REPLIT_DEV_DOMAIN;
  const webhookUrl = replitDomain
    ? `https://${replitDomain}/api/calls/webhook`
    : null;

  try {
    const blandPayload: Record<string, unknown> = {
      phone_number: contact[0].phone,
      task: config.prompt,
      voice: config.voice,
      first_sentence: config.firstMessage,
      max_duration: config.maxDuration,
      record: true,
      answered_by_enabled: true,
      metadata: {
        call_db_id: callRecord.id,
        contact_id: contact[0].id,
      },
    };

    if (webhookUrl) {
      blandPayload.webhook = webhookUrl;
    }

    const blandRes = await fetch(`${BLAND_BASE_URL}/calls`, {
      method: "POST",
      headers: {
        Authorization: BLAND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(blandPayload),
    });

    if (!blandRes.ok) {
      const errText = await blandRes.text();
      console.error("Bland API error:", blandRes.status, errText);
      await db
        .update(callsTable)
        .set({ status: "failed" })
        .where(eq(callsTable.id, callRecord.id));
      res.status(502).json({ error: "Failed to initiate call via BlandAI", details: errText });
      return;
    }

    const blandData = (await blandRes.json()) as { call_id?: string };
    const blandCallId = blandData.call_id;

    // Update record with bland call id and mark in-progress
    const updated = await db
      .update(callsTable)
      .set({
        blandCallId,
        status: "in-progress",
        startedAt: new Date(),
      })
      .where(eq(callsTable.id, callRecord.id))
      .returning();

    // Update last called at on contact
    await db
      .update(contactsTable)
      .set({ lastCalledAt: new Date(), status: "contacted" })
      .where(eq(contactsTable.id, contactId));

    res.status(201).json(serializeCall(updated[0]));
  } catch (err) {
    console.error("Error calling Bland AI:", err);
    await db
      .update(callsTable)
      .set({ status: "failed" })
      .where(eq(callsTable.id, callRecord.id));
    res.status(500).json({ error: "Internal error initiating call" });
  }
});

router.post("/calls/webhook", async (req, res) => {
  const body = req.body as {
    call_id?: string;
    status?: string;
    transcript?: string;
    summary?: string;
    duration?: number;
    metadata?: { call_db_id?: number };
  };

  res.json({ ok: true });

  if (!body.call_id) return;

  // Find matching call record
  const calls = await db
    .select()
    .from(callsTable)
    .where(eq(callsTable.blandCallId, body.call_id))
    .limit(1);

  const callRecord = calls[0];
  if (!callRecord) return;

  const updateData: Partial<typeof callsTable.$inferSelect> = {};

  if (body.status === "completed" || body.status === "ended") {
    updateData.status = "completed";
    updateData.endedAt = new Date();
  } else if (body.status === "failed" || body.status === "error") {
    updateData.status = "failed";
    updateData.endedAt = new Date();
  }

  if (body.transcript) updateData.transcript = body.transcript;
  if (body.summary) updateData.summary = body.summary;
  if (body.duration) updateData.durationSeconds = Math.round(body.duration);

  await db
    .update(callsTable)
    .set(updateData)
    .where(eq(callsTable.id, callRecord.id));
});

router.get("/calls/:id", async (req, res) => {
  const params = GetCallParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const calls = await db
    .select()
    .from(callsTable)
    .where(eq(callsTable.id, params.data.id))
    .limit(1);

  if (!calls[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Try to sync from Bland AI if in-progress and has a blandCallId
  const call = calls[0];
  if (call.blandCallId && (call.status === "in-progress" || call.status === "queued") && BLAND_API_KEY) {
    try {
      const blandRes = await fetch(`${BLAND_BASE_URL}/calls/${call.blandCallId}`, {
        headers: { Authorization: BLAND_API_KEY },
      });
      if (blandRes.ok) {
        const data = (await blandRes.json()) as {
          status?: string;
          transcript?: Array<{ user: string; text: string }> | string;
          summary?: string;
          call_length?: number;
        };

        const updateData: Partial<typeof callsTable.$inferSelect> = {};
        if (data.status === "completed" || data.status === "ended") {
          updateData.status = "completed";
          updateData.endedAt = updateData.endedAt ?? new Date();
        }
        if (data.transcript) {
          if (typeof data.transcript === "string") {
            updateData.transcript = data.transcript;
          } else if (Array.isArray(data.transcript)) {
            updateData.transcript = data.transcript
              .map((t) => `${t.user}: ${t.text}`)
              .join("\n");
          }
        }
        if (data.summary) updateData.summary = data.summary;
        if (data.call_length) updateData.durationSeconds = Math.round(data.call_length);

        if (Object.keys(updateData).length > 0) {
          const updated = await db
            .update(callsTable)
            .set(updateData)
            .where(eq(callsTable.id, call.id))
            .returning();
          res.json(serializeCall(updated[0]));
          return;
        }
      }
    } catch {
      // If Bland API fails, return what we have
    }
  }

  res.json(serializeCall(call));
});

export default router;
