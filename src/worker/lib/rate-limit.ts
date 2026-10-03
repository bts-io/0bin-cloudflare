import type { MiddlewareHandler } from "hono";
import type { AuthEnv } from "./access";
import { fail } from "./http";

/** Seconds a refused client is told to wait: the limiter's window (wrangler.jsonc `ratelimits`). */
const RETRY_AFTER_S = 60;

/**
 * Create brake (spec 7.2): keyed by the verified Access email when the create gate set one, else by client IP.
 * Runs after the create gate. The binding is per-location and approximate: a brake, not a quota.
 */
export const createRateLimit: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const email = c.get("accessEmail");
  const key = email ? `create:${email.toLowerCase()}` : `create:ip:${c.req.header("cf-connecting-ip") ?? ""}`;
  const { success } = await c.env.CREATE_LIMITER.limit({ key });
  if (!success) {
    c.header("Retry-After", String(RETRY_AFTER_S));
    return fail(c, 429, "rate_limited", "Too many pastes, try again in a minute");
  }
  await next();
};
