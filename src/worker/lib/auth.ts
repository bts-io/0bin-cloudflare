import type { Context, MiddlewareHandler } from "hono";
import { z } from "zod";
import { fail, notFound } from "./http";

/**
 * Who may create pastes and read `/api/stats`. `off` (default, also for unknown values) hides both as unknown
 * routes; `open` allows anyone; `token` requires `Authorization: Bearer <CREATE_TOKEN>`.
 */
const CreateMode = z.enum(["off", "open", "token"]).catch("off");

const sha256 = (value: string) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));

/**
 * True when the request carries `Authorization: Bearer <expected>`. Both sides are hashed first so the
 * comparison is constant-time over equal-length digests. An unset or empty `expected` never matches.
 */
async function bearerMatches(c: Context, expected: string | undefined): Promise<boolean> {
  const presented = /^Bearer\s+(\S+)\s*$/i.exec(c.req.header("authorization") ?? "")?.[1];
  if (!expected || !presented) return false;
  const [a, b] = await Promise.all([sha256(presented), sha256(expected)]);
  return crypto.subtle.timingSafeEqual(a, b);
}

const unauthorized = (c: Context) => fail(c, 401, "unauthorized", "Unauthorized");

/** Gate for create and stats: 404 when off, pass when open, CREATE_TOKEN bearer or 401 when token. */
export const createGate: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const mode = CreateMode.parse(c.env.CREATE_MODE);
  if (mode === "off") return notFound(c);
  if (mode === "token" && !(await bearerMatches(c, c.env.CREATE_TOKEN))) return unauthorized(c);
  await next();
};

/**
 * Gate for `/api/admin/*` (spec 5.7): `Authorization: Bearer <ADMIN_TOKEN>` or 401, whatever the create mode.
 * With no `ADMIN_TOKEN` the admin API does not exist (404 like any unknown route).
 */
export const adminGate: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  if (!c.env.ADMIN_TOKEN) return notFound(c);
  c.header("Cache-Control", "no-store");
  if (!(await bearerMatches(c, c.env.ADMIN_TOKEN))) return unauthorized(c);
  await next();
};
