import type { MiddlewareHandler } from "hono";
import { fail } from "./http";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** Turnstile tokens are at most 2048 characters; anything longer is refused without a network call. */
const MAX_TOKEN_LENGTH = 2048;

/** Cloudflare Turnstile siteverify. Fails closed: an unreachable or malformed answer is a failed check. */
async function verifyTurnstile(secret: string, token: string, ip: string | undefined): Promise<boolean> {
  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch(SITEVERIFY, { method: "POST", body });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: unknown };
    return data.success === true;
  } catch {
    return false;
  }
}

/**
 * Bot check for create, opt-in by the TURNSTILE_SECRET_KEY secret: with it set, `X-Turnstile-Token` must pass
 * siteverify or the request gets 403; without it, create is unchanged. Runs after the gate and the rate limit.
 */
export const turnstileCheck: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const secret = c.env.TURNSTILE_SECRET_KEY;
  if (secret) {
    const token = c.req.header("x-turnstile-token") ?? "";
    const ok =
      token.length > 0 &&
      token.length <= MAX_TOKEN_LENGTH &&
      (await verifyTurnstile(secret, token, c.req.header("cf-connecting-ip")));
    if (!ok) return fail(c, 403, "turnstile_failed", "Bot check failed");
  }
  await next();
};
