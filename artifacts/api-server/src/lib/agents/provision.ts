import crypto from "crypto";
import { db, tenantsTable, agentConfigsTable, type Tenant } from "@workspace/db";

export const AGENT_KEYS = [
  "lead",
  "reception",
  "qualifier",
  "followup",
  "booking",
  "content",
] as const;

export type AgentKey = (typeof AGENT_KEYS)[number];

export const AGENT_DISPLAY_NAMES: Record<AgentKey, string> = {
  lead: "Lead Agent",
  reception: "Reception Agent",
  qualifier: "Qualifier Agent",
  followup: "Follow-Up Agent",
  booking: "Booking Agent",
  content: "Content Agent",
};

// Sensible default config blob per agent.
function defaultConfigFor(key: AgentKey): Record<string, unknown> {
  switch (key) {
    case "reception":
      return {
        greeting:
          "Hi! Thanks for reaching out to {{businessName}}. I'm the virtual assistant — how can I help you today?",
        instantReply: true,
      };
    case "followup":
      return { timings: { firstHr: 1, secondHr: 24, thirdDay: 3 } };
    case "qualifier":
      return {
        questions: [
          "What type of job do you need help with?",
          "How urgent is it — is this an emergency?",
          "What's the property address / service location?",
          "What's your budget range for this work?",
        ],
      };
    case "booking":
      return {
        slotRules: {
          durationMinutes: 60,
          bufferMinutes: 15,
          leadTimeHours: 2,
          workingHours: { start: "08:00", end: "18:00" },
        },
      };
    case "content":
      return { platforms: ["instagram_reel", "facebook", "gbp"], cadence: "weekly" };
    case "lead":
    default:
      return {};
  }
}

export interface ProvisionTenantConfig {
  businessName: string;
  serviceType: string;
  serviceArea?: string;
  twilioNumber?: string;
  timezone?: string;
  plan?: string;
  portalPassword?: string;
  isDemo?: boolean;
  googleCalendarId?: string;
}

export async function provisionTenant(config: ProvisionTenantConfig): Promise<Tenant> {
  const accessToken = crypto.randomBytes(24).toString("hex");

  const inserted = await db
    .insert(tenantsTable)
    .values({
      businessName: config.businessName,
      serviceType: config.serviceType,
      serviceArea: config.serviceArea ?? "",
      twilioNumber: config.twilioNumber ?? null,
      timezone: config.timezone ?? "America/New_York",
      plan: config.plan ?? "starter",
      portalPassword: config.portalPassword ?? null,
      isDemo: config.isDemo ?? false,
      googleCalendarId: config.googleCalendarId ?? null,
      accessToken,
    })
    .returning();

  const tenant = inserted[0]!;

  await db.insert(agentConfigsTable).values(
    AGENT_KEYS.map((key) => ({
      tenantId: tenant.id,
      agentKey: key,
      enabled: true,
      config: defaultConfigFor(key),
    })),
  );

  return tenant;
}
