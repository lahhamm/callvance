import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const contentIdeasTable = pgTable("content_ideas", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  weekOf: timestamp("week_of", { withTimezone: true }),
  platform: text("platform").notNull(),
  hook: text("hook"),
  caption: text("caption"),
  cta: text("cta"),
  status: text("status").notNull().default("suggested"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ContentIdea = typeof contentIdeasTable.$inferSelect;
