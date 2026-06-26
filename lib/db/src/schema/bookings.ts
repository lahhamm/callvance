import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id"),
  contactId: integer("contact_id"),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  callId: integer("call_id"),
  scheduledAt: timestamp("scheduled_at").notNull(),
  status: text("status").notNull().default("confirmed"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Booking = typeof bookingsTable.$inferSelect;
