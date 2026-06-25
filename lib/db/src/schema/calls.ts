import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const callsTable = pgTable("calls", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id"),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone").notNull(),
  blandCallId: text("bland_call_id"),
  status: text("status").notNull().default("queued"),
  durationSeconds: integer("duration_seconds"),
  transcript: text("transcript"),
  summary: text("summary"),
  outcome: text("outcome"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCallSchema = createInsertSchema(callsTable).omit({ id: true, createdAt: true });
export type InsertCall = z.infer<typeof insertCallSchema>;
export type Call = typeof callsTable.$inferSelect;
