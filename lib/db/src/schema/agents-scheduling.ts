import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const appointmentsTable = pgTable("appointments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  leadId: integer("lead_id"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  status: text("status").notNull().default("confirmed"),
  googleEventId: text("google_event_id"),
  reminder24Sent: boolean("reminder_24_sent").notNull().default(false),
  reminder2Sent: boolean("reminder_2_sent").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Appointment = typeof appointmentsTable.$inferSelect;

export const scheduledMessagesTable = pgTable("scheduled_messages", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  leadId: integer("lead_id"),
  conversationId: integer("conversation_id"),
  kind: text("kind").notNull(),
  runAt: timestamp("run_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("pending"),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  attempts: integer("attempts").notNull().default(0),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ScheduledMessage = typeof scheduledMessagesTable.$inferSelect;
