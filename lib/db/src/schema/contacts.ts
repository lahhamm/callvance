import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const contactsTable = pgTable("contacts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  company: text("company"),
  notes: text("notes"),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastCalledAt: timestamp("last_called_at"),
});

export const insertContactSchema = createInsertSchema(contactsTable).omit({ id: true, createdAt: true, lastCalledAt: true, status: true });
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contactsTable.$inferSelect;
