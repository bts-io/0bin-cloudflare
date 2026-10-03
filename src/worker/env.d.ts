// Secrets are set with `wrangler secret put`, so `wrangler types` cannot see them; all are optional.
interface Env {
  /** Bearer token for `/api/admin/*`; unset hides the admin API. */
  ADMIN_TOKEN?: string;
  /** Bearer token for create and stats when `CREATE_MODE=token`; unset fails closed. */
  CREATE_TOKEN?: string;
  /** Turnstile secret; when set, create requires a valid `X-Turnstile-Token`. */
  TURNSTILE_SECRET_KEY?: string;
}
