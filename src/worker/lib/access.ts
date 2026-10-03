import type { Context, MiddlewareHandler } from "hono";
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";
import { z } from "zod";
import { fail, notFound } from "./http";

/**
 * Who may create pastes and read `/api/stats`. `off` (default, also for unknown values) hides both as unknown
 * routes; `open` allows anyone; `access` requires a valid Cloudflare Access JWT (spec 7.3, 7.4); `token`
 * requires `Authorization: Bearer <CREATE_TOKEN>`.
 */
const CreateMode = z.enum(["off", "open", "access", "token"]).catch("off");

/** Hono env for gated routes: the gates keep the verified Access email for later handlers. */
export type AuthEnv = { Bindings: Env; Variables: { accessEmail?: string } };

/** One remote key set per team domain, kept for the isolate's lifetime so certs are not fetched per request. */
const keySets = new Map<string, JWTVerifyGetKey>();

const keySet = (teamDomain: string) => {
  let jwks = keySets.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    keySets.set(teamDomain, jwks);
  }
  return jwks;
};

/**
 * Verifies an RS256 token signed by the team's Access keys, issued by the team, for this application.
 * Returns the token's `email` claim (empty string when it has none, e.g. a service token), or null when invalid.
 */
async function verifyAccessJwt(token: string | undefined, env: Env): Promise<string | null> {
  const teamDomain = (env.ACCESS_TEAM_DOMAIN ?? "").replace(/\/+$/, "");
  // Misconfigured access mode fails closed.
  if (!token || !teamDomain || !env.ACCESS_AUD) return null;
  try {
    const { payload } = await jwtVerify(token, keySet(teamDomain), {
      algorithms: ["RS256"],
      issuer: teamDomain,
      audience: env.ACCESS_AUD,
      requiredClaims: ["exp"],
      clockTolerance: 60,
    });
    return typeof payload.email === "string" ? payload.email : "";
  } catch {
    return null;
  }
}

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

/**
 * Gate for create and stats: 404 when off, pass when open, Access JWT or 401 when access (the verified email
 * is kept as `accessEmail`), CREATE_TOKEN bearer or 401 when token.
 */
export const createGate: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const mode = CreateMode.parse(c.env.CREATE_MODE);
  if (mode === "off") return notFound(c);
  if (mode === "access") {
    const email = await verifyAccessJwt(c.req.header("cf-access-jwt-assertion"), c.env);
    if (email === null) return unauthorized(c);
    c.set("accessEmail", email);
  }
  if (mode === "token" && !(await bearerMatches(c, c.env.CREATE_TOKEN))) return unauthorized(c);
  await next();
};

/** `ADMIN_EMAILS` as a lower-case list; empty means every Access-authenticated user is an admin. */
const adminEmails = (env: Env) =>
  env.ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

/**
 * Gate for `/api/admin/*` (spec 5.7, 7.3, 7.4). In access mode: Access JWT or 401, then the email must be in
 * `ADMIN_EMAILS` when that list is set, or 403. In every other mode: `Authorization: Bearer <ADMIN_TOKEN>` or
 * 401, and with no `ADMIN_TOKEN` the admin API does not exist (404 like any unknown route).
 */
export const adminGate: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const accessMode = CreateMode.parse(c.env.CREATE_MODE) === "access";
  if (!accessMode && !c.env.ADMIN_TOKEN) return notFound(c);
  c.header("Cache-Control", "no-store");
  if (accessMode) {
    const email = await verifyAccessJwt(c.req.header("cf-access-jwt-assertion"), c.env);
    if (email === null) return unauthorized(c);
    const allowed = adminEmails(c.env);
    if (allowed.length > 0 && !allowed.includes(email.toLowerCase()))
      return fail(c, 403, "forbidden", "Forbidden");
    c.set("accessEmail", email);
  } else if (!(await bearerMatches(c, c.env.ADMIN_TOKEN))) return unauthorized(c);
  await next();
};
