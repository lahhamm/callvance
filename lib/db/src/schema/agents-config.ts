import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const agentConfigsTable = pgTable("agent_configs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  agentKey: text("agent_key").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  config: jsonb("config").$type<Record<string, unknown>>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AgentConfigRow = typeof agentConfigsTable.$inferSelect;
