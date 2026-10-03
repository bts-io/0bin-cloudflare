import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Stats } from "../../shared/schemas/stats";
import { getDb } from "../db";
import { counters } from "../db/schema";
import { type AuthEnv, createGate } from "../lib/access";

/** Create-page footer counter (spec 5.6), behind the same gate as create. Mounted at /api/stats. */
export const statsRoutes = new Hono<AuthEnv>().get("/", createGate, async (c) => {
  const [row] = await getDb(c.env.DB)
    .select({ value: counters.value })
    .from(counters)
    .where(eq(counters.name, "pastes_created"));
  c.header("Cache-Control", "no-store");
  return c.json({ pastesCreated: row?.value ?? 0 } satisfies Stats);
});
