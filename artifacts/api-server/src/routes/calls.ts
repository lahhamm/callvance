import { Router } from "express";
import { eq, desc, count, inArray, isNull, and, gte, lt } from "drizzle-orm";
import { db, callsTable, contactsTable, agentConfigTable, bookingsTable, availabilityTable, clientsTable } from "@workspace/db";
import Anthropic from "@anthropic-ai/sdk";
import {
  InitiateCallBody,
  GetCallParams,
} from "@workspace/api-zod";
import { sendBookingEmail } from "./bookings";
import { adminAuth } from "../middlewares/admin-auth";
import { computeSlots, getNextAvailableDays, formatSlotsForPrompt, REQUIRED_FIELDS_DIRECTIVE, getClientPublicToken, formatBusinessHoursForPrompt } from "../lib/availability-slots";

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

function parseClaudeJSON<T>(text: string): T {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  return JSON.parse(cleaned) as T;
}

async function initiateCallForContact(contactId: number) {
  console.log(`[initiate] Looking up contact id=${contactId}`);
  const contact = await db.select().from(contactsTable).where(eq(contactsTable.id, contactId)).limit(1);
  if (!contact[0]) throw new Error(`Contact ${contactId} not found`);
  console.log(`[initiate] Found contact name="${contact[0].name}" phone="${contact[0].phone}" clientId=${contact[0].clientId}`);

  const clientId = contact[0].clientId ?? null;

  const configQuery = clientId
    ? db.select().from(agentConfigTable).where(eq(agentConfigTable.clientId, clientId)).limit(1)
    : db.select().from(agentConfigTable).limit(1);
  const configRows = await configQuery;
  const config = configRows[0];
  if (!config) throw new Error("Agent config not found — please configure the agent for this client");
  console.log(`[initiate] Agent config found: agentName="${config.agentName}" voice="${config.voice}"`);
  if (!BLAND_API_KEY) throw new Error("BLAND_AI_API_KEY not configured");

  const inserted = await db.insert(callsTable).values({
    clientId,
    contactId: contact[0].id,
    contactName: contact[0].name,
    contactPhone: contact[0].phone,
    status: "queued",
  }).returning();
  const callRecord = inserted[0];
  console.log(`[initiate] Created call record id=${callRecord.id}`);

  const serverUrl = process.env.SERVER_URL;
  const webhookUrl = serverUrl ? `${serverUrl}/api/calls/webhook` : null;
  console.log(`[initiate] SERVER_URL="${serverUrl ?? "NOT SET"}" webhookUrl="${webhookUrl ?? "NONE — poller will sync instead"}"`);

  let task = config.qualificationCriteria?.trim()
    ? `${config.prompt}\n\nQualification Criteria:\n${config.qualificationCriteria}`
    : config.prompt;
  console.log(`[initiate] Base task built, length=${task.length} chars`);

  // Add availability tool calling + business hours context
  const blandTools: unknown[] = [];
  if (clientId) {
    const availRows = await db.select().from(availabilityTable).where(eq(availabilityTable.clientId, clientId)).limit(1);
    const avail = availRows[0];
    console.log(`[initiate] Availability row found=${!!avail} preventOverlaps=${avail?.preventOverlaps} timezone=${avail?.timezone}`);
    if (avail && serverUrl) {
      const clientToken = getClientPublicToken(clientId);
      const hoursLine = formatBusinessHoursForPrompt(avail);
      task = `${task}\n\n${hoursLine}\n\nBefore offering or confirming any appointment time, you MUST call the check_availability tool with the requested date in YYYY-MM-DD format to get real-time available slots. Never confirm a time without first checking availability.`;
      blandTools.push({
        name: "check_availability",
        description: "Check available appointment slots for a specific date. Always call this before offering or confirming any appointment time.",
        url: `${serverUrl}/api/availability/${clientToken}/slots`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { date: "{{input.date}}" },
        response_data: [
          { name: "available_slots", data: "$.slots", context: "Available appointment times for the requested date" },
          { name: "timezone", data: "$.timezone", context: "Timezone for the slots" },
          { name: "business_hours", data: "$.business_hours", context: "Business operating hours" },
        ],
        input_schema: {
          speech: "Let me check available times for that date.",
          example: { speech: "Let me check available times for that date.", date: "2026-06-30" },
          type: "object",
          properties: {
            speech: "string",
            date: "YYYY-MM-DD format, e.g. 2026-06-30",
          },
        },
      });
      console.log(`[initiate] BlandAI tool 'check_availability' registered at ${serverUrl}/api/availability/${clientToken}/slots`);
    } else if (avail && !serverUrl) {
      // Fallback: static injection when SERVER_URL not set (tool calling requires public URL)
      const nextDays = getNextAvailableDays(5, avail);
      const allSlots: Date[] = [];
      for (const day of nextDays) { allSlots.push(...await computeSlots(clientId, day, avail)); }
      const slotsText = formatSlotsForPrompt(allSlots, avail.timezone, avail);
      if (slotsText) { task = `${task}\n\n${slotsText}`; }
      console.log(`[initiate] SERVER_URL not set — using static slot injection (${allSlots.length} slots)`);
    }
  } else {
    console.log(`[initiate] No clientId on contact — skipping availability`);
  }

  task = `${task}\n\n${REQUIRED_FIELDS_DIRECTIVE}`;

  const blandPayload: Record<string, unknown> = {
    phone_number: contact[0].phone,
    task,
    voice: config.voice,
    first_sentence: config.firstMessage,
    max_duration: config.maxDuration,
    record: true,
    answered_by_enabled: true,
    interruption_threshold: 1000,
    metadata: { call_db_id: callRecord.id, contact_id: contact[0].id },
  };
  if (webhookUrl) blandPayload.webhook = webhookUrl;
  if (blandTools.length > 0) blandPayload.tools = blandTools;

  console.log(`[initiate] Sending to BlandAI — phone="${contact[0].phone}" voice="${config.voice}" max_duration=${config.maxDuration} webhook="${blandPayload.webhook ?? "NONE"}"`);
  console.log(`[initiate] Full task being sent to BlandAI:\n---\n${task}\n---`);

  const blandRes = await fetch(`${BLAND_BASE_URL}/calls`, {
    method: "POST",
    headers: { Authorization: BLAND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(blandPayload),
  });

  const blandRawText = await blandRes.text();
  console.log(`[initiate] BlandAI response status=${blandRes.status} body=${blandRawText.slice(0, 500)}`);

  if (!blandRes.ok) {
    await db.update(callsTable).set({ status: "failed" }).where(eq(callsTable.id, callRecord.id));
    throw new Error(`BlandAI error: ${blandRawText}`);
  }

  const blandData = JSON.parse(blandRawText) as { call_id?: string; c_id?: string; id?: string };
  const blandCallId = blandData.call_id ?? blandData.c_id ?? blandData.id ?? null;
  console.log(`[initiate] BlandAI call_id=${blandCallId}`);

  const updated = await db.update(callsTable)
    .set({ blandCallId, status: "in-progress", startedAt: new Date() })
    .where(eq(callsTable.id, callRecord.id))
    .returning();
  console.log(`[initiate] Call record id=${callRecord.id} updated: blandCallId=${blandCallId} status=in-progress`);

  await db.update(contactsTable)
    .set({ lastCalledAt: new Date(), status: "contacted" })
    .where(eq(contactsTable.id, contactId));

  return updated[0];
}

async function extractBookingFromTranscript(
  transcript: string,
  contactName: string | null,
  contactPhone: string | null,
  contactId: number | null,
  callId: number,
  clientId: number | null,
): Promise<void> {
  console.log(`[booking] Extracting booking from transcript for callId=${callId} contactName="${contactName}" clientId=${clientId}`);

  // Fetch availability row first — need timezone, slot duration, and notification email
  let clientTimezone = "UTC";
  let slotDurationMinutes = 60;
  let notificationEmail: string | null = null;
  if (clientId) {
    const availRows = await db.select().from(availabilityTable).where(eq(availabilityTable.clientId, clientId)).limit(1);
    if (availRows[0]) {
      clientTimezone = availRows[0].timezone;
      slotDurationMinutes = availRows[0].slotDurationMinutes ?? 60;
      notificationEmail = availRows[0].notificationEmail ?? null;
    }
  }

  console.log(`[booking] → Calling Claude (haiku) for booking extraction. transcriptLength=${transcript.length} timezone=${clientTimezone} preview="${transcript.slice(0, 200).replace(/\n/g, " ")}"`);
  try {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: clientTimezone });
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      messages: [{
        role: "user",
        content: `Analyze this phone call transcript and extract any confirmed appointment.

Rules:
- Return a scheduledAt value if the agent and lead AGREED on a specific date AND time (both must be present).
- A confirmation phrase like "I'll book you for...", "we're all set for...", "your appointment is...", "I've scheduled you for..." counts as confirmed.
- The client's timezone is ${clientTimezone}. Today's date in that timezone is ${today}.
- Return the time as ISO 8601 WITH timezone offset (e.g. "2026-06-30T10:00:00-04:00"). NEVER use Z suffix.
- If only a day name is mentioned (e.g. "Monday"), use the nearest upcoming ${today} occurrence.
- If the appointment was NOT confirmed (e.g. agent said fully booked, or call ended before confirming), return null.

Respond ONLY with valid JSON — no explanation, no markdown:
{"scheduledAt": "2026-06-30T10:00:00-04:00", "notes": "roofing inspection"}
or
{"scheduledAt": null}

TRANSCRIPT:
${transcript.slice(0, 3000)}`,
      }],
    });

    const text = response.content.find(b => b.type === "text");
    if (!text || text.type !== "text") { console.log(`[booking] Claude returned no text block for callId=${callId}`); return; }
    console.log(`[booking] Claude raw response text for callId=${callId}: "${text.text.slice(0, 400)}"`);

    const parsed = parseClaudeJSON<{ scheduledAt: string | null; notes?: string }>(text.text);
    console.log(`[booking] Claude parsed scheduledAt string: "${parsed.scheduledAt ?? "null"}"`);
    if (!parsed.scheduledAt) { console.log(`[booking] No appointment confirmed in transcript for callId=${callId}`); return; }

    const scheduledAt = new Date(parsed.scheduledAt);
    console.log(`[booking] new Date("${parsed.scheduledAt}") → UTC="${scheduledAt.toISOString()}" isNaN=${isNaN(scheduledAt.getTime())}`);
    if (isNaN(scheduledAt.getTime()) || scheduledAt < new Date()) {
      console.log(`[booking] scheduledAt invalid or in the past — skipping`);
      return;
    }
    console.log(`[booking] WRITING TO DB: scheduledAt_utc="${scheduledAt.toISOString()}" local_in_${clientTimezone}="${scheduledAt.toLocaleString("en-US", { timeZone: clientTimezone })}"`);

    // Double-booking guard: reject if another confirmed booking occupies this slot
    if (clientId) {
      const slotMs = slotDurationMinutes * 60 * 1000;
      const slotEnd = new Date(scheduledAt.getTime() + slotMs);
      const conflicts = await db.select().from(bookingsTable).where(
        and(
          eq(bookingsTable.clientId, clientId),
          eq(bookingsTable.status, "confirmed"),
          gte(bookingsTable.scheduledAt, scheduledAt),
          lt(bookingsTable.scheduledAt, slotEnd),
        ),
      );
      if (conflicts.length > 0) {
        console.log(`[booking] ✗ DOUBLE-BOOKING BLOCKED: slot ${scheduledAt.toISOString()} already taken by booking id=${conflicts[0].id} — skipping insert`);
        return;
      }
      console.log(`[booking] No conflict for slot ${scheduledAt.toISOString()} — proceeding with insert`);
    }

    const inserted = await db.insert(bookingsTable).values({
      clientId: clientId ?? undefined,
      contactId: contactId ?? undefined,
      contactName,
      contactPhone,
      callId,
      scheduledAt,
      notes: parsed.notes ?? null,
      status: "confirmed",
    }).returning();

    const booking = inserted[0];
    console.log(`[booking] Booking created id=${booking.id} scheduledAt_utc=${scheduledAt.toISOString()} local=${scheduledAt.toLocaleString("en-US", { timeZone: clientTimezone })} clientId=${clientId}`);

    if (notificationEmail) {
      console.log(`[booking] Sending notification email to ${notificationEmail}`);
      await sendBookingEmail(booking, notificationEmail);
    } else if (clientId) {
      console.log(`[booking] No notification email configured for clientId=${clientId}`);
    }

    console.log(`[booking] Auto-created booking for ${contactName ?? contactPhone} at ${scheduledAt.toISOString()}`);
  } catch (err) {
    console.error("[booking] Failed to extract booking from transcript:", err);
  }
}

async function generateAISummary(transcript: string, contactName: string | null, callId?: number): Promise<{ summary: string; keyInsights: string[]; leadScore: string }> {
  console.log(`[ai] generateAISummary called callId=${callId ?? "?"} transcriptLength=${transcript.length} contactName="${contactName}"`);
  console.log(`[ai] → Calling Claude (haiku) for summary. transcriptSlice="${transcript.slice(0, 200).replace(/\n/g, " ")}"`);
  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `You are analyzing a phone call transcript between an AI agent and a potential customer${contactName ? ` named ${contactName}` : ""}.

Extract the most useful information from this call:

1. A 1-2 sentence plain-English SUMMARY of what happened and the outcome.
2. Up to 4 KEY INSIGHTS — short, punchy facts (5-8 words each) about the customer's situation, interests, objections, or next steps.
3. A LEAD SCORE — classify the lead as exactly one of: "Hot" (ready to buy or very interested), "Warm" (interested but needs nurturing), or "Cold" (not interested or poor fit).

Respond with ONLY valid JSON in this format:
{"summary": "...", "keyInsights": ["...", "...", "..."], "leadScore": "Hot"|"Warm"|"Cold"}

TRANSCRIPT:
${transcript.slice(0, 3000)}`
      }],
    });

    const text = response.content.find(b => b.type === "text");
    if (!text || text.type !== "text") {
      console.log(`[ai] Claude returned no text block callId=${callId ?? "?"}`);
      return { summary: "", keyInsights: [], leadScore: "" };
    }

    console.log(`[ai] Claude raw summary response callId=${callId ?? "?"}: ${text.text.slice(0, 300)}`);
    const parsed = parseClaudeJSON<{ summary: string; keyInsights: string[]; leadScore: string }>(text.text);
    const result = {
      summary: parsed.summary || "",
      keyInsights: Array.isArray(parsed.keyInsights) ? parsed.keyInsights.slice(0, 4) : [],
      leadScore: ["Hot", "Warm", "Cold"].includes(parsed.leadScore) ? parsed.leadScore : "",
    };
    console.log(`[ai] Summary parsed callId=${callId ?? "?"}: leadScore="${result.leadScore}" summary="${result.summary.slice(0, 80)}"`);
    return result;
  } catch (err) {
    console.error(`[ai] generateAISummary failed callId=${callId ?? "?"}:`, err);
    return { summary: "", keyInsights: [], leadScore: "" };
  }
}

export async function syncInProgressCalls(): Promise<void> {
  if (!BLAND_API_KEY) { console.log("[poll] Skipping sync — BLAND_AI_API_KEY not set"); return; }
  try {
    const inProgress = await db.select().from(callsTable)
      .where(inArray(callsTable.status, ["in-progress", "queued"]));

    if (inProgress.length === 0) { console.log("[poll] No in-progress or queued calls to sync"); return; }
    console.log(`[poll] Syncing ${inProgress.length} in-progress call(s) with BlandAI`);

    for (const call of inProgress) {
      if (!call.blandCallId) {
        console.log(`[poll] Skipping call id=${call.id} — no blandCallId saved yet`);
        continue;
      }
      console.log(`[poll] Checking BlandAI for call id=${call.id} blandCallId=${call.blandCallId}`);
      try {
        const blandRes = await fetch(`${BLAND_BASE_URL}/calls/${call.blandCallId}`, {
          headers: { Authorization: BLAND_API_KEY },
        });
        if (!blandRes.ok) {
          console.log(`[poll] BlandAI returned ${blandRes.status} for call id=${call.id} — skipping`);
          continue;
        }

        const data = (await blandRes.json()) as {
          status?: string;
          answered_by?: string;
          transcript?: Array<{ user: string; text: string }> | string;
          transcripts?: Array<{ user: string; text: string }>;
          summary?: string;
          call_length?: number;
          duration?: number;
          total_duration?: number;
        };

        // BlandAI uses call_length (in minutes) on the GET endpoint; log whichever fields are present
        const rawDuration = data.call_length ?? data.total_duration ?? data.duration;
        console.log(`[poll] BlandAI status="${data.status}" answered_by="${data.answered_by ?? "?"}" call_length=${data.call_length ?? "?"} duration=${data.duration ?? "?"} total_duration=${data.total_duration ?? "?"} has_transcript=${!!(data.transcript ?? data.transcripts)} for call id=${call.id}`);

        const isCompleted = data.status === "completed" || data.status === "ended";
        const isFailed = data.status === "failed" || data.status === "error" || data.status === "no-answer";
        if (!isCompleted && !isFailed) {
          console.log(`[poll] Call id=${call.id} still in status="${data.status}" — no update needed`);
          continue;
        }

        // answered_by="human" → definitely answered; "voicemail" → definitely not.
        // "unknown" is ambiguous — BlandAI can't classify; defer to transcript presence below.
        let wasAnswered = data.answered_by === "human";
        const updateData: Partial<typeof callsTable.$inferSelect> = {};
        if (isCompleted) {
          if (wasAnswered) {
            updateData.status = "completed"; updateData.endedAt = new Date();
            console.log(`[poll] Call id=${call.id} answered by human → completed`);
          } else {
            updateData.status = "no-answer"; updateData.endedAt = new Date();
            console.log(`[poll] Call id=${call.id} ended but answered_by="${data.answered_by ?? "unknown"}" → no-answer (tentative, may upgrade if transcript found)`);
          }
        } else if (isFailed) { updateData.status = "failed"; updateData.endedAt = new Date(); }

        // call_length is in minutes on BlandAI's GET endpoint; duration/total_duration may be in seconds
        if (rawDuration) {
          updateData.durationSeconds = data.call_length
            ? Math.round(data.call_length * 60)
            : Math.round(rawDuration);
          console.log(`[poll] Duration for call id=${call.id}: rawDuration=${rawDuration} → durationSeconds=${updateData.durationSeconds}`);
        }

        // Normalize whichever transcript field BlandAI returned
        const rawTranscript = data.transcript ?? data.transcripts;
        let transcriptText: string | undefined;
        if (rawTranscript) {
          transcriptText = typeof rawTranscript === "string"
            ? rawTranscript
            : rawTranscript.filter(t => t.text?.trim()).map(t => `${t.user}: ${t.text}`).join("\n");
          if (!transcriptText.trim()) transcriptText = undefined;
          if (transcriptText) {
            updateData.transcript = transcriptText;
            console.log(`[poll] Transcript extracted for call id=${call.id}: ${transcriptText.length} chars`);
          }
        }

        // If the call completed but no transcript came back, fetch the full call details
        // separately — BlandAI sometimes omits transcript from status responses
        if (isCompleted && !transcriptText && call.blandCallId) {
          console.log(`[poll] Call id=${call.id} completed but no transcript in poll response — fetching full details from BlandAI`);
          try {
            const detailRes = await fetch(`${BLAND_BASE_URL}/calls/${call.blandCallId}`, {
              headers: { Authorization: BLAND_API_KEY },
            });
            if (detailRes.ok) {
              const detail = (await detailRes.json()) as {
                transcript?: Array<{ user: string; text: string }> | string;
                transcripts?: Array<{ user: string; text: string }>;
                call_length?: number;
                duration?: number;
                total_duration?: number;
              };
              const detailRaw = detail.transcript ?? detail.transcripts;
              if (detailRaw) {
                const detailText = typeof detailRaw === "string"
                  ? detailRaw
                  : (detailRaw as Array<{ user: string; text: string }>).filter(t => t.text?.trim()).map(t => `${t.user}: ${t.text}`).join("\n");
                if (detailText.trim()) {
                  transcriptText = detailText;
                  updateData.transcript = transcriptText;
                  console.log(`[poll] Follow-up fetch got transcript for call id=${call.id}: ${transcriptText.length} chars`);
                }
              }
              // Also grab duration if we didn't get it from the first response
              if (!updateData.durationSeconds) {
                const detailDuration = detail.call_length ?? detail.total_duration ?? detail.duration;
                if (detailDuration) {
                  updateData.durationSeconds = detail.call_length
                    ? Math.round(detail.call_length * 60)
                    : Math.round(detailDuration);
                }
              }
              if (!transcriptText) {
                console.log(`[poll] Follow-up fetch also returned no transcript for call id=${call.id} — will complete without summary`);
              }
            } else {
              console.log(`[poll] Follow-up fetch returned ${detailRes.status} for call id=${call.id}`);
            }
          } catch (err) {
            console.error(`[poll] Follow-up fetch failed for call id=${call.id}:`, err);
          }
        }

        // Upgrade "unknown" calls to completed when a transcript exists — a transcript
        // proves a real conversation happened regardless of what BlandAI classified.
        // "voicemail" stays no-answer even with a transcript.
        if (!wasAnswered && data.answered_by !== "voicemail" && transcriptText) {
          wasAnswered = true;
          if (updateData.status === "no-answer") updateData.status = "completed";
          console.log(`[poll] Call id=${call.id} upgraded no-answer → completed: answered_by="${data.answered_by ?? "unknown"}" but transcript present`);
        }

        if (isCompleted && wasAnswered && transcriptText) {
          console.log(`[poll] Running AI summary for call id=${call.id}`);
          const aiResult = await generateAISummary(transcriptText, call.contactName, call.id);
          if (aiResult.summary) updateData.summary = aiResult.summary;
          if (aiResult.keyInsights.length > 0) updateData.keyInsights = JSON.stringify(aiResult.keyInsights);
          if (aiResult.leadScore) updateData.leadScore = aiResult.leadScore;
          console.log(`[poll] AI result for call id=${call.id}: leadScore="${aiResult.leadScore}" summary="${aiResult.summary.slice(0, 80)}"`);
        } else if (isCompleted && !transcriptText) {
          console.log(`[poll] Call id=${call.id} completed with no transcript after follow-up — marking complete with no summary`);
        } else if (isCompleted && !wasAnswered) {
          console.log(`[poll] Call id=${call.id} not answered (answered_by="${data.answered_by ?? "unknown"}") — skipping AI summary`);
        }

        console.log(`[poll] Writing DB update for call id=${call.id}: status=${updateData.status} hasTranscript=${!!updateData.transcript} hasSummary=${!!updateData.summary} leadScore=${updateData.leadScore ?? "none"} durationSeconds=${updateData.durationSeconds ?? "none"}`);
        await db.update(callsTable).set(updateData).where(eq(callsTable.id, call.id));
        console.log(`[poll] DB update done for call id=${call.id} → status=${updateData.status}`);

        if (isCompleted && wasAnswered && transcriptText) {
          const existingBooking = await db.select().from(bookingsTable).where(eq(bookingsTable.callId, call.id)).limit(1);
          if (!existingBooking[0]) {
            console.log(`[poll] Attempting booking extraction for call id=${call.id}`);
            await extractBookingFromTranscript(transcriptText, call.contactName ?? null, call.contactPhone, call.contactId ?? null, call.id, call.clientId ?? null);
          } else {
            console.log(`[poll] Booking already exists for call id=${call.id} — skipping extraction`);
          }
        }
      } catch (err) {
        console.error(`[poll] Failed to sync call id=${call.id}:`, err);
      }
    }
    // ── Retry recently-completed calls that have no transcript yet ────────────
    // BlandAI sometimes processes the transcript a few seconds after sending
    // the webhook — the webhook handler marks the call "completed" immediately
    // but finds no transcript, and the poller never re-checks it because it
    // only watches in-progress/queued calls.  Here we also retry any call that
    // completed within the last 15 minutes but still has no transcript.
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const recentlyCompletedNoTranscript = await db.select().from(callsTable)
      .where(and(
        eq(callsTable.status, "completed"),
        isNull(callsTable.transcript),
        gte(callsTable.endedAt, fifteenMinutesAgo),
      ));

    if (recentlyCompletedNoTranscript.length > 0) {
      console.log(`[poll] ${recentlyCompletedNoTranscript.length} recently-completed call(s) still missing transcript — retrying`);
    }

    for (const call of recentlyCompletedNoTranscript) {
      if (!call.blandCallId) {
        console.log(`[poll][retry] Skipping call id=${call.id} — no blandCallId`);
        continue;
      }
      console.log(`[poll][retry] Fetching transcript from BlandAI for completed call id=${call.id} blandCallId=${call.blandCallId}`);
      try {
        const blandRes = await fetch(`${BLAND_BASE_URL}/calls/${call.blandCallId}`, {
          headers: { Authorization: BLAND_API_KEY! },
        });
        if (!blandRes.ok) {
          console.log(`[poll][retry] BlandAI returned ${blandRes.status} for call id=${call.id} — skipping`);
          continue;
        }
        const data = (await blandRes.json()) as {
          transcript?: Array<{ user: string; text: string }> | string;
          transcripts?: Array<{ user: string; text: string }>;
          answered_by?: string;
          call_length?: number;
          duration?: number;
          total_duration?: number;
        };

        const rawTranscript = data.transcript ?? data.transcripts;
        if (!rawTranscript) {
          console.log(`[poll][retry] Call id=${call.id} — BlandAI still has no transcript, will retry next cycle`);
          continue;
        }
        const transcriptText = typeof rawTranscript === "string"
          ? rawTranscript
          : (rawTranscript as Array<{ user: string; text: string }>).filter(t => t.text?.trim()).map(t => `${t.user}: ${t.text}`).join("\n");
        if (!transcriptText.trim()) {
          console.log(`[poll][retry] Call id=${call.id} — transcript present but empty after normalization`);
          continue;
        }

        console.log(`[poll][retry] Got transcript for call id=${call.id}: ${transcriptText.length} chars — running AI summary`);
        const retryUpdate: Partial<typeof callsTable.$inferSelect> = { transcript: transcriptText };

        const rawDuration = data.call_length ?? data.total_duration ?? data.duration;
        if (rawDuration && !call.durationSeconds) {
          retryUpdate.durationSeconds = data.call_length
            ? Math.round(data.call_length * 60)
            : Math.round(rawDuration);
        }

        const aiResult = await generateAISummary(transcriptText, call.contactName, call.id);
        if (aiResult.summary) retryUpdate.summary = aiResult.summary;
        if (aiResult.keyInsights.length > 0) retryUpdate.keyInsights = JSON.stringify(aiResult.keyInsights);
        if (aiResult.leadScore) retryUpdate.leadScore = aiResult.leadScore;
        console.log(`[poll][retry] AI result for call id=${call.id}: leadScore="${aiResult.leadScore}" summary="${aiResult.summary.slice(0, 80)}"`);

        await db.update(callsTable).set(retryUpdate).where(eq(callsTable.id, call.id));
        console.log(`[poll][retry] DB updated for call id=${call.id} — transcript + summary saved`);

        const existingBooking = await db.select().from(bookingsTable).where(eq(bookingsTable.callId, call.id)).limit(1);
        if (!existingBooking[0]) {
          console.log(`[poll][retry] Attempting booking extraction for call id=${call.id}`);
          await extractBookingFromTranscript(transcriptText, call.contactName ?? null, call.contactPhone, call.contactId ?? null, call.id, call.clientId ?? null);
        } else {
          console.log(`[poll][retry] Booking already exists for call id=${call.id} — skipping extraction`);
        }
      } catch (err) {
        console.error(`[poll][retry] Failed to retry call id=${call.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[poll] syncInProgressCalls error:", err);
  }
}

// ── GET /calls ───────────────────────────────────────────────────────────────
router.get("/calls", adminAuth, async (_req, res) => {
  const calls = await db.select().from(callsTable).orderBy(desc(callsTable.createdAt));
  res.json(calls.map(serializeCall));
});

// ── GET /calls/stats/summary ─────────────────────────────────────────────────
router.get("/calls/stats/summary", adminAuth, async (_req, res) => {
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
router.post("/calls/initiate", adminAuth, async (req, res) => {
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
router.post("/calls/bulk", adminAuth, async (req, res) => {
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
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      results.push({ contactId, success: false, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  res.json({ results, succeeded: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length });
});

// ── POST /calls/webhook ─────────────────────────────────────────────── PUBLIC
router.post("/calls/webhook", async (req, res) => {
  const body = req.body as {
    call_id?: string;
    status?: string;
    answered_by?: string;  // "human" | "voicemail" | "no-answer" | "unknown"
    // BlandAI sends transcript as either a plain string or an array of turn objects
    transcript?: string | Array<{ user: string; text: string }>;
    summary?: string;
    duration?: number;
    call_length?: number;
    metadata?: { call_db_id?: number; contact_id?: number; client_id?: number };
  };

  console.log(`[webhook] ===== INCOMING WEBHOOK =====`);
  console.log(`[webhook] RAW BODY KEYS: ${Object.keys(body).join(", ")}`);
  console.log(`[webhook] call_id="${body.call_id}" status="${body.status}" answered_by="${body.answered_by ?? "?"}" call_length=${body.call_length ?? body.duration ?? "?"} metadata=${JSON.stringify(body.metadata)}`);

  // Log the raw transcript before touching it so we can see exactly what BlandAI sent
  if (body.transcript === undefined || body.transcript === null) {
    console.log(`[webhook] RAW transcript: MISSING (undefined/null) — no transcript in webhook payload`);
  } else if (typeof body.transcript === "string") {
    console.log(`[webhook] RAW transcript: STRING length=${body.transcript.length} preview="${body.transcript.slice(0, 300)}"`);
  } else if (Array.isArray(body.transcript)) {
    console.log(`[webhook] RAW transcript: ARRAY turns=${body.transcript.length} first_turn=${JSON.stringify(body.transcript[0] ?? null)}`);
  } else {
    console.log(`[webhook] RAW transcript: UNEXPECTED TYPE=${typeof body.transcript} value=${JSON.stringify(body.transcript).slice(0, 200)}`);
  }

  // Normalize transcript to a plain string immediately — BlandAI sends it either way
  let transcriptText: string | undefined;
  if (body.transcript) {
    transcriptText = typeof body.transcript === "string"
      ? body.transcript
      : body.transcript.filter(t => t.text?.trim()).map(t => `${t.user}: ${t.text}`).join("\n");
    if (!transcriptText.trim()) transcriptText = undefined;
  }
  console.log(`[webhook] NORMALIZED transcript: ${transcriptText ? `${transcriptText.length} chars` : "EMPTY/UNDEFINED after normalization"}`);

  // Acknowledge BlandAI immediately
  res.json({ ok: true });

  // ── Step 1: Locate call record ──────────────────────────────────────────────
  let callRecord: typeof callsTable.$inferSelect | undefined;

  if (body.call_id) {
    const byId = await db.select().from(callsTable).where(eq(callsTable.blandCallId, body.call_id)).limit(1);
    callRecord = byId[0];
    console.log(`[webhook] Lookup by blandCallId="${body.call_id}" → found=${!!callRecord}${callRecord ? ` (db id=${callRecord.id})` : ""}`);
  }

  if (!callRecord && body.metadata?.call_db_id) {
    const byMeta = await db.select().from(callsTable).where(eq(callsTable.id, body.metadata.call_db_id)).limit(1);
    callRecord = byMeta[0];
    console.log(`[webhook] Lookup by metadata.call_db_id=${body.metadata.call_db_id} → found=${!!callRecord}`);
    if (callRecord && body.call_id && !callRecord.blandCallId) {
      await db.update(callsTable).set({ blandCallId: body.call_id }).where(eq(callsTable.id, callRecord.id));
      callRecord = { ...callRecord, blandCallId: body.call_id };
      console.log(`[webhook] Back-filled blandCallId="${body.call_id}" on call id=${callRecord.id}`);
    }
  }

  if (!callRecord) {
    console.warn(`[webhook] ❌ No call record found — call_id="${body.call_id}" metadata=${JSON.stringify(body.metadata)} — cannot process`);
    return;
  }
  console.log(`[webhook] ✓ Call record found: db id=${callRecord.id} clientId=${callRecord.clientId} contactId=${callRecord.contactId} currentStatus="${callRecord.status}"`);

  // ── Step 2: Determine new status ────────────────────────────────────────────
  const isCompleted = body.status === "completed" || body.status === "ended";
  const isFailed = body.status === "failed" || body.status === "error" || body.status === "no-answer";
  // answered_by="human" → definitely answered. "voicemail" → definitely not.
  // "unknown" means BlandAI couldn't classify — treat as answered if a transcript is present,
  // since a real conversation is the only way a transcript gets generated.
  const wasAnswered = body.answered_by === "human" ||
    (body.answered_by !== "voicemail" && body.answered_by !== "no-answer" && !!transcriptText);
  console.log(`[webhook] Status mapping: incoming="${body.status}" answered_by="${body.answered_by ?? "?"}" hasTranscript=${!!transcriptText} → isCompleted=${isCompleted} isFailed=${isFailed} wasAnswered=${wasAnswered}`);

  const updateData: Partial<typeof callsTable.$inferSelect> = {};
  if (isCompleted) {
    if (wasAnswered) {
      updateData.status = "completed"; updateData.endedAt = new Date();
      console.log(`[webhook] Call answered by human → completed`);
    } else {
      updateData.status = "no-answer"; updateData.endedAt = new Date();
      console.log(`[webhook] Call ended but not answered by human (answered_by="${body.answered_by ?? "unknown"}") → no-answer`);
    }
  } else if (isFailed) { updateData.status = "failed"; updateData.endedAt = new Date(); }
  if (transcriptText) updateData.transcript = transcriptText;
  if (body.summary) updateData.summary = body.summary;
  if (body.call_length) updateData.durationSeconds = Math.round(body.call_length * 60);
  else if (body.duration) updateData.durationSeconds = Math.round(body.duration);

  // ── Step 3: AI processing (only on calls answered by a human or unknown-with-transcript) ─
  // Bail out early only for definitively-not-answered calls (voicemail / no-answer).
  // "unknown" with no transcript still gets a follow-up fetch below before we give up.
  const definitelyNotAnswered = isCompleted && !wasAnswered &&
    (body.answered_by === "voicemail" || body.answered_by === "no-answer");
  if (definitelyNotAnswered) {
    console.log(`[webhook] Call not answered (answered_by="${body.answered_by}") — skipping AI processing and booking extraction`);
    if (Object.keys(updateData).length > 0) {
      await db.update(callsTable).set(updateData).where(eq(callsTable.id, callRecord.id));
      console.log(`[webhook] ✓ no-answer status written for call id=${callRecord.id}`);
    }
    return;
  }

  if (isCompleted) {
    // If BlandAI didn't include the transcript in the webhook, fetch it directly from their API
    if (!transcriptText) {
      const blandId = body.call_id ?? callRecord.blandCallId;
      console.log(`[webhook] No transcript in webhook payload — fetching from BlandAI API for blandCallId="${blandId}"`);
      if (blandId && BLAND_API_KEY) {
        try {
          const fetchRes = await fetch(`${BLAND_BASE_URL}/calls/${blandId}`, {
            headers: { Authorization: BLAND_API_KEY },
          });
          if (fetchRes.ok) {
            const fetchData = (await fetchRes.json()) as {
              transcript?: string | Array<{ user: string; text: string }>;
              call_length?: number;
            };
            if (fetchData.transcript) {
              transcriptText = typeof fetchData.transcript === "string"
                ? fetchData.transcript
                : (fetchData.transcript as Array<{ user: string; text: string }>)
                    .filter(t => t.text?.trim())
                    .map(t => `${t.user}: ${t.text}`)
                    .join("\n");
              if (!transcriptText.trim()) transcriptText = undefined;
              if (transcriptText) {
                updateData.transcript = transcriptText;
                console.log(`[webhook] Fetched transcript from BlandAI: ${transcriptText.length} chars`);
              }
            }
            if (fetchData.call_length && !updateData.durationSeconds) {
              updateData.durationSeconds = Math.round(fetchData.call_length * 60);
            }
          } else {
            console.log(`[webhook] BlandAI API returned ${fetchRes.status} when fetching transcript for blandCallId="${blandId}"`);
          }
        } catch (err) {
          console.error(`[webhook] Failed to fetch transcript from BlandAI for blandCallId="${blandId}":`, err);
        }
      } else {
        console.log(`[webhook] Cannot fetch transcript — blandId="${blandId}" BLAND_API_KEY=${!!BLAND_API_KEY}`);
      }
    }

    // If we arrived here with answered_by="unknown" and no transcript in the original payload,
    // the follow-up fetch may have just retrieved one — re-evaluate wasAnswered.
    if (!wasAnswered && body.answered_by !== "voicemail" && body.answered_by !== "no-answer" && transcriptText) {
      console.log(`[webhook] Call id=${callRecord.id} upgraded: answered_by="${body.answered_by ?? "unknown"}" but transcript now present → treating as completed`);
      if (updateData.status === "no-answer") updateData.status = "completed";
    }

    if (transcriptText) {
      console.log(`[webhook] Transcript available (${transcriptText.length} chars). Running AI summary...`);

      let contactName = callRecord.contactName;
      if (!contactName && callRecord.contactId) {
        const contact = await db.select().from(contactsTable).where(eq(contactsTable.id, callRecord.contactId)).limit(1);
        if (contact[0]) { contactName = contact[0].name; updateData.contactName = contactName; }
      }
      if (!contactName && callRecord.contactPhone) {
        const contact = await db.select().from(contactsTable).where(eq(contactsTable.phone, callRecord.contactPhone)).limit(1);
        if (contact[0]) { contactName = contact[0].name; updateData.contactName = contactName; }
      }
      console.log(`[webhook] contactName resolved to: "${contactName ?? "unknown"}"`);

      const aiResult = await generateAISummary(transcriptText, contactName, callRecord.id);
      if (aiResult.summary) updateData.summary = aiResult.summary;
      if (aiResult.keyInsights.length > 0) updateData.keyInsights = JSON.stringify(aiResult.keyInsights);
      if (aiResult.leadScore) updateData.leadScore = aiResult.leadScore;
      console.log(`[webhook] AI result: leadScore="${aiResult.leadScore}" summary="${aiResult.summary.slice(0, 80)}"`);
    } else {
      console.log(`[webhook] No transcript available for call id=${callRecord.id} — skipping AI summary`);
    }

    console.log(`[webhook] Writing to DB: id=${callRecord.id} fields=${Object.keys(updateData).join(", ")}`);
    const dbResult = await db.update(callsTable).set(updateData).where(eq(callsTable.id, callRecord.id)).returning();
    console.log(`[webhook] ✓ DB write complete for call id=${callRecord.id} — status="${dbResult[0]?.status}" leadScore="${dbResult[0]?.leadScore}" hasSummary=${!!dbResult[0]?.summary} hasTranscript=${!!dbResult[0]?.transcript}`);

    if (transcriptText) {
      const existingBooking = await db.select().from(bookingsTable).where(eq(bookingsTable.callId, callRecord.id)).limit(1);
      if (!existingBooking[0]) {
        await extractBookingFromTranscript(transcriptText, callRecord.contactName ?? null, callRecord.contactPhone, callRecord.contactId ?? null, callRecord.id, callRecord.clientId ?? null);
      } else {
        console.log(`[webhook] Booking already exists for call id=${callRecord.id} — skipping extraction`);
      }
    }
    return;
  }

  if (!isFailed) {
    console.log(`[webhook] Status "${body.status}" is not terminal — saving intermediate update only`);
  }

  if (Object.keys(updateData).length > 0) {
    console.log(`[webhook] Writing non-terminal update for call id=${callRecord.id}: fields=${Object.keys(updateData).join(", ")}`);
    await db.update(callsTable).set(updateData).where(eq(callsTable.id, callRecord.id));
    console.log(`[webhook] ✓ DB write complete for call id=${callRecord.id} → status=${updateData.status ?? "unchanged"}`);
  } else {
    console.log(`[webhook] No fields to update for call id=${callRecord.id}`);
  }
});

// ── GET /calls/:id ────────────────────────────────────────────────────────────
router.get("/calls/:id", adminAuth, async (req, res) => {
  const params = GetCallParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const calls = await db.select().from(callsTable).where(eq(callsTable.id, params.data.id)).limit(1);
  if (!calls[0]) { res.status(404).json({ error: "Not found" }); return; }

  const call = calls[0];

  if (call.blandCallId && (call.status === "in-progress" || call.status === "queued") && BLAND_API_KEY) {
    try {
      const blandRes = await fetch(`${BLAND_BASE_URL}/calls/${call.blandCallId}`, {
        headers: { Authorization: BLAND_API_KEY },
      });
      if (blandRes.ok) {
        const data = (await blandRes.json()) as {
          status?: string;
          answered_by?: string;
          transcript?: Array<{ user: string; text: string }> | string;
          summary?: string;
          call_length?: number;
        };

        const updateData: Partial<typeof callsTable.$inferSelect> = {};
        const isCompleted = data.status === "completed" || data.status === "ended";
        const wasAnswered = data.answered_by === "human";
        if (isCompleted) {
          if (wasAnswered) {
            updateData.status = "completed"; updateData.endedAt = new Date();
          } else {
            updateData.status = "no-answer"; updateData.endedAt = new Date();
          }
        }

        let transcriptText: string | undefined;
        if (data.transcript) {
          transcriptText = typeof data.transcript === "string"
            ? data.transcript
            : data.transcript.map(t => `${t.user}: ${t.text}`).join("\n");
          updateData.transcript = transcriptText;
        }
        if (data.call_length) updateData.durationSeconds = Math.round(data.call_length * 60);
        if (data.summary) updateData.summary = data.summary;

        if (isCompleted && wasAnswered && transcriptText && !call.keyInsights) {
          const aiResult = await generateAISummary(transcriptText, call.contactName, call.id);
          if (aiResult.summary) updateData.summary = aiResult.summary;
          if (aiResult.keyInsights.length > 0) updateData.keyInsights = JSON.stringify(aiResult.keyInsights);
          if (aiResult.leadScore) updateData.leadScore = aiResult.leadScore;
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

// ── PUBLIC: GET /api/availability/:clientToken/slots?date=YYYY-MM-DD ─────────
// No auth required — clientToken is an HMAC derived from clientId + SESSION_SECRET.
// Called by BlandAI mid-conversation to check real-time available slots.
// BlandAI calls this as POST with JSON body { date: "YYYY-MM-DD" } ({{input.date}} interpolation).
// GET with :date path segment is kept for manual testing.
async function handleAvailabilityRequest(clientToken: string, date: string, res: import("express").Response) {
  console.log(`[availability] ── REQUEST ── token="${clientToken}" date="${date || "MISSING"}"`);

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.log(`[availability] ✗ Bad date param: "${date}" — returning 400`);
    res.status(400).json({ error: "date required as YYYY-MM-DD", slots: [] });
    return;
  }

  // Find which client this token belongs to
  const allClients = await db.select().from(clientsTable);
  console.log(`[availability] Matching token against ${allClients.length} client(s)`);
  const matched = allClients.find(c => getClientPublicToken(c.id) === clientToken);
  if (!matched) {
    console.log(`[availability] ✗ No client matched token="${clientToken}" — returning 404`);
    res.status(404).json({ error: "Invalid token", slots: [] });
    return;
  }
  console.log(`[availability] ✓ Matched clientId=${matched.id} name="${matched.name}"`);

  const availRows = await db.select().from(availabilityTable)
    .where(eq(availabilityTable.clientId, matched.id)).limit(1);
  const avail = availRows[0];
  if (!avail) {
    console.log(`[availability] ✗ No availability row for clientId=${matched.id} — returning empty`);
    res.json({ date, timezone: "UTC", business_hours: null, slots: [] });
    return;
  }
  console.log(`[availability] Avail row: timezone="${avail.timezone}" startTime="${avail.startTime}" endTime="${avail.endTime}" slotDuration=${avail.slotDurationMinutes}min preventOverlaps=${avail.preventOverlaps} availableDays="${avail.availableDays}"`);

  const slots = await computeSlots(matched.id, date, avail);
  const tz = avail.timezone;
  const formatted = slots.map(s =>
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(s)
  );

  console.log(`[availability] ── RESPONSE ── clientId=${matched.id} date=${date} slots=${formatted.length}: [${formatted.join(", ")}]`);

  res.json({
    date,
    timezone: tz,
    business_hours: `${avail.startTime} to ${avail.endTime}`,
    slots: formatted,
  });
}

// POST — used by BlandAI (body: { date: "YYYY-MM-DD" } via {{input.date}} interpolation)
router.post("/availability/:clientToken/slots", async (req, res) => {
  const { clientToken } = req.params;
  const date = ((req.body as { date?: string }).date ?? "").trim();
  console.log(`[availability] POST body: ${JSON.stringify(req.body)}`);
  await handleAvailabilityRequest(clientToken, date, res);
});

// GET — kept for manual testing: /api/availability/:token/slots/2026-06-30
router.get("/availability/:clientToken/slots/:date", async (req, res) => {
  const { clientToken, date } = req.params;
  await handleAvailabilityRequest(clientToken, (date ?? "").trim(), res);
});

export default router;
