import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gt, isNotNull, isNull, lt, lte, or, type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  AdminListQuery,
  type AdminPasteList,
  type AdminPurgeResult,
  type AdminStats,
  type PasteState,
} from "../../shared/schemas/admin";
import { Id } from "../../shared/schemas/paste";
import { getDb } from "../db";
import { counters, pastes } from "../db/schema";
import { adminGate } from "../lib/auth";
import { fail, notFound } from "../lib/http";
import { purgeExpired } from "../lib/purge";

const inState = (state: PasteState, now: number): SQL | undefined =>
  state === "active"
    ? or(isNull(pastes.expiresAt), gt(pastes.expiresAt, now))
    : and(isNotNull(pastes.expiresAt), lte(pastes.expiresAt, now));

/** Rows strictly after the cursor in `created_at DESC, id DESC` order. */
const afterCursor = (cursor: string): SQL | undefined => {
  const split = cursor.indexOf(":");
  const createdAt = Number(cursor.slice(0, split));
  const id = cursor.slice(split + 1);
  return or(lt(pastes.createdAt, createdAt), and(eq(pastes.createdAt, createdAt), lt(pastes.id, id)));
};

/** Admin API (spec 5.7). Mounted at /api/admin; every route sits behind `adminGate`. */
export const adminRoutes = new Hono<{ Bindings: Env }>()
  .use("*", adminGate)
  .get(
    "/pastes",
    zValidator("query", AdminListQuery, (result, c) => {
      if (!result.success) return fail(c, 400, "invalid_request", "Invalid query", result.error.issues);
    }),
    async (c) => {
      const { limit, cursor, state } = c.req.valid("query");
      const rows = await getDb(c.env.DB)
        .select({
          id: pastes.id,
          kind: pastes.kind,
          size: pastes.size,
          burn: pastes.burn,
          createdAt: pastes.createdAt,
          expiresAt: pastes.expiresAt,
        })
        .from(pastes)
        .where(and(inState(state, Date.now()), cursor ? afterCursor(cursor) : undefined))
        .orderBy(desc(pastes.createdAt), desc(pastes.id))
        .limit(limit + 1);
      const items = rows.slice(0, limit);
      const last = items.at(-1);
      const nextCursor = rows.length > limit && last ? `${last.createdAt}:${last.id}` : null;
      return c.json({ items, nextCursor } satisfies AdminPasteList);
    },
  )
  .delete(
    "/pastes/:id",
    zValidator("param", z.object({ id: Id }), (result, c) => {
      if (!result.success) return notFound(c);
    }),
    async (c) => {
      const { meta } = await getDb(c.env.DB)
        .delete(pastes)
        .where(eq(pastes.id, c.req.valid("param").id));
      return meta.changes === 1 ? c.body(null, 204) : notFound(c);
    },
  )
  .get("/stats", async (c) => {
    const db = getDb(c.env.DB);
    const [[live], [created]] = await db.batch([
      db
        .select({
          active: sql<number>`count(*)`,
          burnPending: sql<number>`coalesce(sum(${pastes.burn}), 0)`,
          totalBytes: sql<number>`coalesce(sum(${pastes.size}), 0)`,
        })
        .from(pastes)
        .where(inState("active", Date.now())),
      db.select({ value: counters.value }).from(counters).where(eq(counters.name, "pastes_created")),
    ]);
    return c.json({
      active: live?.active ?? 0,
      burnPending: live?.burnPending ?? 0,
      totalBytes: live?.totalBytes ?? 0,
      pastesCreated: created?.value ?? 0,
    } satisfies AdminStats);
  })
  .post("/purge", async (c) => c.json({ deleted: await purgeExpired(c.env.DB) } satisfies AdminPurgeResult));
