import { pgTable, integer, text, timestamp, index } from "drizzle-orm/pg-core";

// დელეგატების პროფილების ნახვების მთვლელი
export const clicks = pgTable("clicks", {
  delegateId: integer("delegate_id").primaryKey(),
  count: integer("count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ადმინისტრატორის პაროლი (scrypt hash + salt). მხოლოდ ერთი ჩანაწერი, id = 1
export const adminAuth = pgTable("admin_auth", {
  id: integer("id").primaryKey(),
  salt: text("salt").notNull(),
  hash: text("hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// აქტიური ადმინ სესიები. ბაზაში ინახება მხოლოდ ტოკენის sha256 hash
export const adminSessions = pgTable(
  "admin_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("admin_sessions_expires_at_idx").on(table.expiresAt)]
);
