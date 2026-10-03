// Secrets are set with `wrangler secret put`, so `wrangler types` cannot see them; both are optional.
interface Env {
  /** Bearer token for `/api/admin/*` outside access mode; unset hides the admin API. */
  ADMIN_TOKEN?: string;
  /** Bearer token for create and stats when `CREATE_MODE=token`; unset fails closed. */
  CREATE_TOKEN?: string;
}
