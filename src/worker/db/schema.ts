// CHECK constraints and the counter seed live in migrations/0002_pastes.sql; Drizzle does not model them.
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** One encrypted paste. Timestamps are epoch milliseconds; `expiresAt` NULL means never. */
export const pastes = sqliteTable(
  "pastes",
  {
    id: text("id").primaryKey(),
    ciphertext: text("ciphertext").notNull(),
    size: integer("size").notNull(),
    kind: text("kind", { enum: ["text", "file"] }).notNull(),
    burn: integer("burn", { mode: "boolean" }).notNull().default(false),
    readTokenHash: text("read_token_hash").notNull(),
    ownerTokenHash: text("owner_token_hash").notNull(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at"),
  },
  (t) => [
    index("pastes_expires_at_idx").on(t.expiresAt).where(sql`${t.expiresAt} IS NOT NULL`),
    index("pastes_created_at_idx").on(t.createdAt, t.id),
  ],
);

/** Named monotonic counters, seeded by the migration (`pastes_created`). */
export const counters = sqliteTable("counters", {
  name: text("name").primaryKey(),
  value: integer("value").notNull().default(0),
});
