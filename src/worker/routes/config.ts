import { Hono } from "hono";
import type { PublicConfig } from "../../shared/schemas/config";

/** Public settings for the browser (`GET /api/config`), answered in every create mode. */
export const configRoutes = new Hono<{ Bindings: Env }>().get("/", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({ turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || null } satisfies PublicConfig);
});
