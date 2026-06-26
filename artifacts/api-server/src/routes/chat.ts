import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { eq, desc } from "drizzle-orm";
import { db, contactsTable, callsTable, agentConfigTable } from "@workspace/db";

const router = Router();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BLAND_API_KEY = process.env.BLAND_AI_API_KEY;
const BLAND_BASE_URL = "https://api.bland.ai/v1";

router.post("/chat", async (req, res) => {
  const { message, history = [] } = req.body as {
    message: string;
    history: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!message) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  // Load context from DB
  const [contacts, recentCalls, configRows] = await Promise.all([
    db.select().from(contactsTable).orderBy(contactsTable.createdAt),
    db.select().from(callsTable).orderBy(desc(callsTable.createdAt)).limit(5),
    db.select().from(agentConfigTable).limit(1),
  ]);

  const config = configRows[0];

  const contactList = contacts.length
    ? contacts
        .map(
          (c) =>
            `- ID ${c.id}: ${c.name} | ${c.phone}${c.company ? ` | ${c.company}` : ""}${c.email ? ` | ${c.email}` : ""} | status: ${c.status}`
        )
        .join("\n")
    : "No contacts yet.";

  const recentCallList = recentCalls.length
    ? recentCalls
        .map(
          (c) =>
            `- ${c.contactName ?? c.contactPhone} | ${c.status} | ${c.createdAt.toLocaleDateString()}`
        )
        .join("\n")
    : "No calls yet.";

  const systemPrompt = `You are a smart assistant that controls Callvance, an AI-powered outbound calling system.

You help users trigger calls and answer questions about their contacts and call history. Be concise and direct — this is a command center, not a chatbot.

When the user asks you to call someone, use the initiate_call tool. Figure out the right contact_id from the list if they mention a name, or use phone_number if they give a number directly. If they describe a custom topic or script, pass it as custom_topic.

## Available Contacts
${contactList}

## Recent Calls
${recentCallList}

## Current Agent Config
Name: ${config?.agentName ?? "AI Assistant"} | Voice: ${config?.voice ?? "maya"} | Max Duration: ${config?.maxDuration ?? 300}s

Rules:
- If the user says "call [name]", find the matching contact by name and use initiate_call with their contact_id.
- If the user gives a raw phone number, use initiate_call with phone_number instead.
- If the user specifies a topic (e.g. "ask about their timeline"), include it as custom_topic.
- If the contact doesn't exist, suggest they add it first via the Contacts page, and offer to call a raw number if they have one.
- For questions about history/stats, answer from the context provided above.
- Keep responses short (1–3 sentences). Use terminal-style language to match the UI.`;

  const tools: Anthropic.Tool[] = [
    {
      name: "initiate_call",
      description:
        "Initiate an outbound AI voice call. Use contact_id if calling an existing contact, or phone_number for a raw number. Optionally override the call topic with custom_topic.",
      input_schema: {
        type: "object" as const,
        properties: {
          contact_id: {
            type: "number",
            description: "ID of an existing contact to call",
          },
          phone_number: {
            type: "string",
            description:
              "Raw phone number to call (use when contact_id is not available)",
          },
          custom_topic: {
            type: "string",
            description:
              "Custom instructions for what the AI should discuss on this call, overriding the default prompt",
          },
        },
      },
    },
  ];

  try {
    // First Claude call to determine intent
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      tools,
      messages: [
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: "user", content: message },
      ],
    });

    // Check if Claude wants to call a tool
    const toolUse = response.content.find((b) => b.type === "tool_use");

    if (toolUse && toolUse.type === "tool_use" && toolUse.name === "initiate_call") {
      const input = toolUse.input as {
        contact_id?: number;
        phone_number?: string;
        custom_topic?: string;
      };

      let callResult: { success: boolean; message: string; call?: object } = {
        success: false,
        message: "Call failed.",
      };

      try {
        // Resolve contact info
        let contactId: number | undefined = input.contact_id;
        let contactPhone: string | undefined = input.phone_number;
        let contactName: string | undefined;

        if (contactId) {
          const contact = await db
            .select()
            .from(contactsTable)
            .where(eq(contactsTable.id, contactId))
            .limit(1);
          if (!contact[0]) {
            callResult = { success: false, message: `Contact ID ${contactId} not found.` };
          } else {
            contactPhone = contact[0].phone;
            contactName = contact[0].name;
          }
        }

        if (contactPhone && !callResult.message.includes("not found")) {
          // Resolve per-client config using the already-fetched contact (avoid double lookup)
          let effectiveConfig = config;
          let resolvedClientId: number | null = null;
          if (contactId) {
            // contact[0] was already fetched above in the contactId block
            const cachedContact = await db.select().from(contactsTable).where(eq(contactsTable.id, contactId)).limit(1);
            if (cachedContact[0]?.clientId) {
              resolvedClientId = cachedContact[0].clientId;
              const clientConfig = await db.select().from(agentConfigTable).where(eq(agentConfigTable.clientId, resolvedClientId)).limit(1);
              if (clientConfig[0]) effectiveConfig = clientConfig[0];
            }
          }

          // Build prompt — merge custom_topic into the agent's base prompt
          const basePrompt = effectiveConfig?.prompt ?? "You are a helpful AI assistant.";
          const effectivePrompt = input.custom_topic
            ? `${basePrompt}\n\nIMPORTANT — Special instructions for this specific call: ${input.custom_topic}`
            : basePrompt;

          // Insert call record with clientId so it appears in the client portal
          const inserted = await db
            .insert(callsTable)
            .values({
              clientId: resolvedClientId,
              contactId: contactId ?? null,
              contactName: contactName ?? null,
              contactPhone,
              status: "queued",
            })
            .returning();
          const callRecord = inserted[0];

          const replitDomain = process.env.REPLIT_DEV_DOMAIN;
          const webhookUrl = replitDomain
            ? `https://${replitDomain}/api/calls/webhook`
            : null;

          const blandPayload: Record<string, unknown> = {
            phone_number: contactPhone,
            task: effectivePrompt,
            voice: effectiveConfig?.voice ?? "maya",
            first_sentence: effectiveConfig?.firstMessage ?? "Hi, this is an AI calling to follow up.",
            max_duration: effectiveConfig?.maxDuration ?? 300,
            record: true,
            answered_by_enabled: true,
            metadata: { call_db_id: callRecord.id, contact_id: contactId },
          };
          if (webhookUrl) blandPayload.webhook = webhookUrl;

          const blandRes = await fetch(`${BLAND_BASE_URL}/calls`, {
            method: "POST",
            headers: {
              Authorization: BLAND_API_KEY!,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(blandPayload),
          });

          if (blandRes.ok) {
            const blandData = (await blandRes.json()) as { call_id?: string };
            await db
              .update(callsTable)
              .set({ blandCallId: blandData.call_id, status: "in-progress", startedAt: new Date() })
              .where(eq(callsTable.id, callRecord.id));

            if (contactId) {
              await db
                .update(contactsTable)
                .set({ lastCalledAt: new Date(), status: "contacted" })
                .where(eq(contactsTable.id, contactId));
            }

            callResult = {
              success: true,
              message: `Call to ${contactName ?? contactPhone} initiated.`,
              call: { id: callRecord.id, phone: contactPhone, name: contactName },
            };
          } else {
            const err = await blandRes.text();
            await db.update(callsTable).set({ status: "failed" }).where(eq(callsTable.id, callRecord.id));
            callResult = { success: false, message: `BlandAI error: ${err}` };
          }
        }
      } catch (err) {
        console.error("Tool execution error:", err);
        callResult = { success: false, message: "Internal error while initiating call." };
      }

      // Second Claude call: give it the tool result so it can respond naturally
      const followUp = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: systemPrompt,
        tools,
        messages: [
          ...history.map((h) => ({ role: h.role, content: h.content })),
          { role: "user", content: message },
          { role: "assistant", content: response.content },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: JSON.stringify(callResult),
              },
            ],
          },
        ],
      });

      const replyText = followUp.content
        .filter((b) => b.type === "text")
        .map((b) => (b as Anthropic.TextBlock).text)
        .join("");

      res.json({
        message: replyText || (callResult.success ? "Call initiated." : callResult.message),
        callInitiated: callResult.success,
        call: callResult.call,
      });
      return;
    }

    // No tool use — plain text response
    const replyText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");

    res.json({ message: replyText, callInitiated: false });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "Failed to process message" });
  }
});

export default router;
