import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const availabilityTable = pgTable("availability_settings", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id"),
  timezone: text("timezone").notNull().default("America/New_York"),
  notificationEmail: text("notification_email"),
  availableDays: text("available_days").notNull().default("[1,2,3,4,5]"),
  startTime: text("start_time").notNull().default("09:00"),
  endTime: text("end_time").notNull().default("17:00"),
  slotDurationMinutes: integer("slot_duration_minutes").notNull().default(30),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Availability = typeof availabilityTable.$inferSelect;
