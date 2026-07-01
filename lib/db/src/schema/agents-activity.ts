import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const activityLogTable = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  agentKey: text("agent_key").notNull(),
  action: text("action").notNull(),
  description: text("description").notNull(),
  leadId: integer("lead_id"),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ActivityLogEntry = typeof activityLogTable.$inferSelect;
