import { defineConfig } from "drizzle-kit";

// Migrations are generated locally (`bun run db:generate`) into ./migrations; `bun run deploy` applies them
// with `wrangler d1 migrations apply` before the Worker ships.
export default defineConfig({
  dialect: "sqlite",
  casing: "snake_case",
  schema: "./src/worker/db/schema.ts",
  out: "./migrations",
});
