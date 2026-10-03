/**
 * Single Worker entry: the Hono API owns /api; every other request is server-rendered by TanStack Start.
 * Security headers for both are set here, in one place.
 */
import startHandler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { isWorkerOwned } from "./shared/routing";
import worker from "./worker/index";
import { purgeExpired } from "./worker/lib/purge";
import { createNonce, withSecurityHeaders } from "./worker/lib/security-headers";

const entry = createServerEntry({
  async fetch(request: Request, ...rest: unknown[]) {
    const [env, ctx] = rest as [Env, ExecutionContext];
    const { pathname } = new URL(request.url);
    if (isWorkerOwned(pathname)) return withSecurityHeaders(await worker.fetch(request, env, ctx));
    // The router reads the nonce from the request context (src/client/router.tsx) and stamps every inline script.
    const nonce = createNonce();
    const res = await startHandler.fetch(request, { responseLinkHeader: true, context: { nonce } });
    // Only the create page loads Turnstile, so only it may load Cloudflare's script and challenge frame.
    return withSecurityHeaders(res, nonce, pathname === "/");
  },
});

export default {
  fetch: entry.fetch,
  // Hourly (wrangler.jsonc triggers): reclaims storage of expired pastes, which reads already hide.
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(purgeExpired(env.DB).then((n) => console.log(`purge: deleted ${n} expired pastes`)));
  },
};
