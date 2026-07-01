import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const tenantsTable = pgTable("tenants", {
  id: serial("id").primaryKey(),
  businessName: text("business_name").notNull(),
  serviceType: text("service_type").notNull().default(""),
  serviceArea: text("service_area").default(""),
  twilioNumber: text("twilio_number"),
  timezone: text("timezone").notNull().default("America/New_York"),
  plan: text("plan").notNull().default("starter"),
  googleCalendarId: text("google_calendar_id"),
  googleRefreshToken: text("google_refresh_token"),
  accessToken: text("access_token").notNull().unique(),
  portalPassword: text("portal_password"),
  isActive: boolean("is_active").notNull().default(true),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Tenant = typeof tenantsTable.$inferSelect;
