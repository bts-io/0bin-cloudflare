// Secrets are set with `wrangler secret put`, so `wrangler types` cannot see them; all are optional.
interface Env {
  /** Bearer token for `/api/admin/*` outside access mode; unset hides the admin API. */
  ADMIN_TOKEN?: string;
  /** Bearer token for create and stats when `CREATE_MODE=token`; unset fails closed. */
  CREATE_TOKEN?: string;
  /** `https://<team>.cloudflareaccess.com` for `CREATE_MODE=access`: the JWT issuer and JWKS host. */
  ACCESS_TEAM_DOMAIN?: string;
  /** AUD tag of the protected Access application; must be in the JWT `aud`. */
  ACCESS_AUD?: string;
}
