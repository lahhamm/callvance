import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  name: text("name"),
  phone: text("phone").notNull(),
  jobType: text("job_type"),
  urgency: text("urgency"),
  location: text("location"),
  budget: text("budget"),
  status: text("status").notNull().default("new"),
  temperature: text("temperature"),
  summary: text("summary"),
  value: integer("value").notNull().default(0),
  source: text("source"),
  lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Lead = typeof leadsTable.$inferSelect;

export const conversationsTable = pgTable("conversations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  leadId: integer("lead_id").notNull(),
  channel: text("channel").notNull().default("sms"),
  status: text("status").notNull().default("open"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Conversation = typeof conversationsTable.$inferSelect;

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  conversationId: integer("conversation_id"),
  leadId: integer("lead_id"),
  direction: text("direction").notNull(),
  body: text("body").notNull(),
  twilioSid: text("twilio_sid"),
  status: text("status"),
  agentKey: text("agent_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Message = typeof messagesTable.$inferSelect;
