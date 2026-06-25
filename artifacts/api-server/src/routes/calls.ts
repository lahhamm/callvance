import { Router } from "express";
import { eq, desc, count } from "drizzle-orm";
import { db, callsTable, contactsTable, agentConfigTable } from "@workspace/db";
import Anthropic from "@anthropic-ai/sdk";
import {
  InitiateCallBody,
  GetCallParams,
} from "@workspace/api-zod";

const router = Router();
const BLAND_API_KEY = process.env.BLAND_AI_API_KEY;
const BLAND_BASE_URL = "https://api.bland.ai/v1";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function serializeCall(c: typeof callsTable.$inferSelect) {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    startedAt: c.startedAt ? c.startedAt.toISOString() : null,
    endedAt: c.endedAt ? c.endedAt.toISOString() : null,
  };
}

async function initiateCallForContact(contactId: number) {
  const contact = await db.select().from(contactsTable).where(eq(contactsTable.id, contactId)).limit(1);
  if (!contact[0]) throw new Error(`Contact ${contactId} not found`);

  const configRows = await db.select().from(agentConfigTable).limit(1);
  const config = configRows[0];
  if (!config) throw new Error("Agent config not found");
  if (!BLAND_API_KEY) throw new Error("BLAND_AI_API_KEY not configured");

  const inserted = await db.insert(callsTable).values({
    contactId: contact[0].id,
    contactName: contact[0].name,
    contactPhone: contact[0].phone,
    status: "queued",
  }).returning();
  const callRecord = inserted[0];

  const replitDomain = process.env.REPLIT_DEV_DOMAIN;
  const webhookUrl = replitDomain ? `https://${replitDomain}/api/calls/webhook` : null;

  const blandPayload: Record<string, unknown> = {
    phone_number: contact[0].phone,
    task: config.prompt,
    voice: config.voice,
    first_sentence: config.firstMessage,
    max_duration: config.maxDuration,
    record: true,
    answered_by_enabled: true,
    metadata: { call_db_id: callRecord.id, contact_id: contact[0].id },
  };
  if (webhookUrl) blandPayload.webhook = webhookUrl;

  const blandRes = await fetch(`${BLAND_BASE_URL}/calls`, {
    method: "POST",
    headers: { Authorization: BLAND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(blandPayload),
  });

  if (!blandRes.ok) {
    const err = await blandRes.text();
    await db.update(callsTable).set({ status: "failed" }).where(eq(callsTable.id, callRecord.id));
    throw new Error(`BlandAI error: ${err}`);
  }

  const blandData = (await blandRes.json()) as { call_id?: string };
  const updated = await db.update(callsTable)
    .set({ blandCallId: blandData.call_id, status: "in-progress", startedAt: new Date() })
    .where(eq(callsTable.id, callRecord.id))
    .returning();

  await db.update(contactsTable)
    .set({ lastCalledAt: new Date(), status: "contacted" })
    .where(eq(contactsTable.id, contactId));

  return updated[0];
}

async function generateAISummary(transcript: string, contactName: string | null): Promise<{ summary: string; keyInsights: string[] }> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `You are analyzing a phone call transcript between an AI agent and a potential customer${contactName ? ` named ${contactName}` : ""}.

Extract the most useful information from this call in two parts:

1. A 1-2 sentence plain-English SUMMARY of what happened and the outcome.
2. Up to 4 KEY INSIGHTS — short, punchy facts (5-8 words each) about the customer's situation, interests, objections, or next steps. These will be shown as highlight tags.

Respond with ONLY valid JSON in this format:
{"summary": "...", "keyInsights": ["...", "...", "..."]}

TRANSCRIPT:
${transcript.slice(0, 3000)}`
      }],
    });

    const text = response.content.find(b => b.type === "text");
    if (!text || text.type !== "text") return { summary: "", keyInsights: [] };

    const parsed = JSON.parse(text.text.trim()) as { summary: string; keyInsights: string[] };
    return {
      summary: parsed.summary || "",
      keyInsights: Array.isArray(parsed.keyInsights) ? parsed.keyInsights.slice(0, 4) : [],
    };
  } catch {
    return { summary: "", keyInsights: [] };
  }
}

// ── GET /calls ───────────────────────────────────────────────────────────────
router.get("/calls", async (_req, res) => {
  const calls = await db.select().from(callsTable).orderBy(desc(callsTable.createdAt));
  res.json(calls.map(serializeCall));
});

// ── GET /calls/stats/summary ─────────────────────────────────────────────────
router.get("/calls/stats/summary", async (_req, res) => {
  const allCalls = await db.select().from(callsTable);
  const totalContacts = await db.select({ count: count() }).from(contactsTable);
  const total = allCalls.length;
  const completed = allCalls.filter(c => c.status === "completed").length;
  const failed = allCalls.filter(c => c.status === "failed").length;
  const inProgress = allCalls.filter(c => c.status === "in-progress").length;
  const durations = allCalls.filter(c => c.durationSeconds != null).map(c => c.durationSeconds as number);
  const avgDurationSeconds = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
  res.json({ total, completed, failed, inProgress, avgDurationSeconds, totalContacts: totalContacts[0]?.count ?? 0 });
});

// ── POST /calls/initiate ──────────────────────────────────────────────────────
router.post("/calls/initiate", async (req, res) => {
  const parsed = InitiateCallBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  try {
    const callRecord = await initiateCallForContact(parsed.data.contactId);
    res.status(201).json(serializeCall(callRecord));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    res.status(msg.includes("not found") ? 404 : 502).json({ error: msg });
  }
});

// ── POST /calls/bulk ──────────────────────────────────────────────────────────
router.post("/calls/bulk", async (req, res) => {
  const { contactIds } = req.body as { contactIds: number[] };
  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    res.status(400).json({ error: "contactIds must be a non-empty array" });
    return;
  }

  const results: Array<{ contactId: number; success: boolean; callId?: number; error?: string }> = [];

  for (const contactId of contactIds) {
    try {
      const callRecord = await initiateCallForContact(contactId);
      results.push({ contactId, success: true, callId: callRecord.id });
      // Small delay between calls
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      results.push({ contactId, success: false, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  res.json({ results, succeeded: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length });
});

// ── POST /calls/webhook ───────────────────────────────────────────────────────
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

  const calls = await db.select().from(callsTable).where(eq(callsTable.blandCallId, body.call_id)).limit(1);
  const callRecord = calls[0];
  if (!callRecord) return;

  const isCompleted = body.status === "completed" || body.status === "ended";
  const isFailed = body.status === "failed" || body.status === "error";

  const updateData: Partial<typeof callsTable.$inferSelect> = {};
  if (isCompleted) { updateData.status = "completed"; updateData.endedAt = new Date(); }
  else if (isFailed) { updateData.status = "failed"; updateData.endedAt = new Date(); }
  if (body.transcript) updateData.transcript = body.transcript;
  if (body.summary) updateData.summary = body.summary;
  if (body.duration) updateData.durationSeconds = Math.round(body.duration);

  // If call completed with a transcript, generate AI summary + key insights
  if (isCompleted && body.transcript) {
    // Resolve contactName if missing
    let contactName = callRecord.contactName;
    if (!contactName && callRecord.contactId) {
      const contact = await db.select().from(contactsTable).where(eq(contactsTable.id, callRecord.contactId)).limit(1);
      if (contact[0]) {
        contactName = contact[0].name;
        updateData.contactName = contactName;
      }
    }
    if (!contactName && callRecord.contactPhone) {
      const contact = await db.select().from(contactsTable).where(eq(contactsTable.phone, callRecord.contactPhone)).limit(1);
      if (contact[0]) {
        contactName = contact[0].name;
        updateData.contactName = contactName;
      }
    }

    const aiResult = await generateAISummary(body.transcript, contactName);
    if (aiResult.summary) updateData.summary = aiResult.summary;
    if (aiResult.keyInsights.length > 0) updateData.keyInsights = JSON.stringify(aiResult.keyInsights);
  }

  await db.update(callsTable).set(updateData).where(eq(callsTable.id, callRecord.id));
});

// ── GET /calls/:id ────────────────────────────────────────────────────────────
router.get("/calls/:id", async (req, res) => {
  const params = GetCallParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const calls = await db.select().from(callsTable).where(eq(callsTable.id, params.data.id)).limit(1);
  if (!calls[0]) { res.status(404).json({ error: "Not found" }); return; }

  const call = calls[0];

  // Sync from Bland AI if still in-progress
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
        const isCompleted = data.status === "completed" || data.status === "ended";
        if (isCompleted) { updateData.status = "completed"; updateData.endedAt = new Date(); }

        let transcriptText: string | undefined;
        if (data.transcript) {
          transcriptText = typeof data.transcript === "string"
            ? data.transcript
            : data.transcript.map(t => `${t.user}: ${t.text}`).join("\n");
          updateData.transcript = transcriptText;
        }
        if (data.summary) updateData.summary = data.summary;
        if (data.call_length) updateData.durationSeconds = Math.round(data.call_length);

        // Generate AI summary if completing now with transcript
        if (isCompleted && transcriptText && !call.keyInsights) {
          const aiResult = await generateAISummary(transcriptText, call.contactName);
          if (aiResult.summary) updateData.summary = aiResult.summary;
          if (aiResult.keyInsights.length > 0) updateData.keyInsights = JSON.stringify(aiResult.keyInsights);
        }

        if (Object.keys(updateData).length > 0) {
          const updated = await db.update(callsTable).set(updateData).where(eq(callsTable.id, call.id)).returning();
          res.json(serializeCall(updated[0]));
          return;
        }
      }
    } catch { /* fall through */ }
  }

  res.json(serializeCall(call));
});

export default router;
