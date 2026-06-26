import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  businessType: text("business_type").notNull().default(""),
  phone: text("phone").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  accessToken: text("access_token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Client = typeof clientsTable.$inferSelect;
