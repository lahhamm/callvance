import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentConfigTable = pgTable("agent_config", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id"),
  agentName: text("agent_name").notNull().default("AI Assistant"),
  voice: text("voice").notNull().default("maya"),
  prompt: text("prompt").notNull().default("You are a friendly AI assistant following up with a potential customer who recently submitted a form expressing interest in our services. Be professional, conversational, and helpful. Ask about their needs and schedule a follow-up if appropriate.\n\nBefore confirming any appointment you must collect:\n1. Full property address (street, city, state)\n2. Preferred date and time (only offer available slots)\n3. Confirm the lead's phone number or best contact number\nDo not confirm the appointment until all three are collected."),
  firstMessage: text("first_message").notNull().default("Hi, this is an AI assistant calling on behalf of our team. I noticed you recently filled out a form expressing interest in our services. Do you have a few minutes to chat?"),
  maxDuration: integer("max_duration").notNull().default(300),
  qualificationCriteria: text("qualification_criteria"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAgentConfigSchema = createInsertSchema(agentConfigTable).omit({ id: true, updatedAt: true });
export type InsertAgentConfig = z.infer<typeof insertAgentConfigSchema>;
export type AgentConfig = typeof agentConfigTable.$inferSelect;
