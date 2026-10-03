import { zValidator } from "@hono/zod-validator";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { CreatePasteBody, EXPIRY_MS, Id, Token } from "../../shared/schemas/paste";
import { getDb } from "../db";
import { counters, pastes } from "../db/schema";
import { createGate } from "../lib/auth";
import { fail, notFound } from "../lib/http";
import { createRateLimit } from "../lib/rate-limit";
import { decodedLength, randomB64u, sha256Hex, versionByte } from "../lib/tokens";

const MAX_BODY_BYTES = 1_500_000;
/** Fresh ids tried after a primary-key collision before the create fails. */
const ID_RETRIES = 3;

const IdParam = zValidator("param", z.object({ id: Id }), (result, c) => {
  if (!result.success) return notFound(c);
});

const hashedToken = async (value: string | undefined) => {
  const token = Token.safeParse(value);
  return token.success ? sha256Hex(token.data) : null;
};

const live = (now: number) => or(isNull(pastes.expiresAt), gt(pastes.expiresAt, now));

const readFields = {
  id: pastes.id,
  ciphertext: pastes.ciphertext,
  kind: pastes.kind,
  burn: pastes.burn,
  createdAt: pastes.createdAt,
  expiresAt: pastes.expiresAt,
};

const isIdConflict = (err: unknown): boolean =>
  err instanceof Error &&
  (err.message.includes("UNIQUE constraint failed: pastes.id") || isIdConflict(err.cause));

/** Paste routes (spec 5.1-5.4). Mounted at /api/pastes. */
export const pasteRoutes = new Hono<{ Bindings: Env }>()
  // Registered before the header middleware so a disabled create is byte-for-byte an unknown route.
  .post("/", createGate)
  .use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("X-Robots-Tag", "noindex");
    await next();
  })
  .post(
    "/",
    createRateLimit,
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => fail(c, 413, "payload_too_large", "Request body is too large"),
    }),
    async (c, next) => {
      const type = c.req.header("content-type") ?? "";
      if (!/^application\/json\s*(;|$)/i.test(type))
        return fail(c, 415, "unsupported_media_type", "Send application/json");
      await next();
    },
    zValidator("json", CreatePasteBody, (result, c) => {
      if (result.success) return;
      const { issues } = result.error;
      if (issues.some((i) => i.code === "too_big" && i.path[0] === "ciphertext"))
        return fail(c, 413, "payload_too_large", "Ciphertext is too large");
      return fail(c, 400, "invalid_request", "Invalid paste", issues);
    }),
    async (c) => {
      const body = c.req.valid("json");
      const size = decodedLength(body.ciphertext);
      if (size === null || versionByte(body.ciphertext) !== 1)
        return fail(c, 400, "invalid_request", "Unsupported ciphertext format");

      const ownerToken = randomB64u(32);
      const [readTokenHash, ownerTokenHash] = await Promise.all([
        sha256Hex(body.readToken),
        sha256Hex(ownerToken),
      ]);
      const createdAt = Date.now();
      const duration = EXPIRY_MS[body.expiry];
      const expiresAt = duration === null ? null : createdAt + duration;
      const db = getDb(c.env.DB);

      for (let attempt = 0; ; attempt++) {
        const id = randomB64u(9);
        try {
          await db.batch([
            db.insert(pastes).values({
              id,
              ciphertext: body.ciphertext,
              size,
              kind: body.kind,
              burn: body.burn,
              readTokenHash,
              ownerTokenHash,
              createdAt,
              expiresAt,
            }),
            db
              .update(counters)
              .set({ value: sql`${counters.value} + 1` })
              .where(eq(counters.name, "pastes_created")),
          ]);
        } catch (err) {
          if (attempt < ID_RETRIES && isIdConflict(err)) continue;
          throw err;
        }
        return c.json({ id, url: `/p/${id}`, ownerToken, createdAt, expiresAt, burn: body.burn }, 201);
      }
    },
  )
  .get("/:id/meta", IdParam, async (c) => {
    const { id } = c.req.valid("param");
    const readTokenHash = await hashedToken(c.req.header("x-read-token"));
    if (!readTokenHash) return notFound(c);
    const [row] = await getDb(c.env.DB)
      .select({
        id: pastes.id,
        kind: pastes.kind,
        size: pastes.size,
        burn: pastes.burn,
        createdAt: pastes.createdAt,
        expiresAt: pastes.expiresAt,
      })
      .from(pastes)
      .where(and(eq(pastes.id, id), eq(pastes.readTokenHash, readTokenHash), live(Date.now())));
    return row ? c.json(row) : notFound(c);
  })
  .get("/:id", IdParam, async (c) => {
    const { id } = c.req.valid("param");
    const now = Date.now();
    const db = getDb(c.env.DB);

    // 1. Creator peek: never deletes, even on a burn paste.
    const ownerTokenHash = await hashedToken(c.req.header("x-owner-token"));
    if (ownerTokenHash) {
      const [row] = await db
        .select(readFields)
        .from(pastes)
        .where(and(eq(pastes.id, id), eq(pastes.ownerTokenHash, ownerTokenHash), live(now)));
      if (row) return c.json({ ...row, burned: false });
    }

    const readTokenHash = await hashedToken(c.req.header("x-read-token"));
    if (!readTokenHash) return notFound(c);
    const match = and(eq(pastes.id, id), eq(pastes.readTokenHash, readTokenHash), live(now));

    // 2. Burn read: one DELETE ... RETURNING, so concurrent readers can never both get the row.
    const [burned] = await db
      .delete(pastes)
      .where(and(match, eq(pastes.burn, true)))
      .returning(readFields);
    if (burned) return c.json({ ...burned, burned: true });

    // 3. Normal read.
    const [row] = await db
      .select(readFields)
      .from(pastes)
      .where(and(match, eq(pastes.burn, false)));
    return row ? c.json({ ...row, burned: false }) : notFound(c);
  })
  .delete("/:id", IdParam, async (c) => {
    const { id } = c.req.valid("param");
    const ownerTokenHash = await hashedToken(c.req.header("x-owner-token"));
    if (!ownerTokenHash) return fail(c, 400, "invalid_request", "X-Owner-Token header is required");
    const { meta } = await getDb(c.env.DB)
      .delete(pastes)
      .where(and(eq(pastes.id, id), eq(pastes.ownerTokenHash, ownerTokenHash)));
    return meta.changes === 1 ? c.body(null, 204) : notFound(c);
  });
