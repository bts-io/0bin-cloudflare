# Changelog

## 0.1.0 (2026-10-03)

First public release.

- Client-side encrypted pastes: text and files, WebCrypto AES-GCM with the key only in the URL fragment, HKDF read token so the id alone cannot fetch or burn a paste.
- Expiry (1 hour to never) and burn after reading as one atomic D1 `DELETE ... RETURNING`; hourly purge.
- Create page (file picker, drag-drop, clipboard paste, my-pastes list), view page (highlighting for about 30 languages, image preview, owner delete, burn interstitial), admin page.
- Create modes `off`, `open`, `token` (shared team key) and `access` (Cloudflare Access JWT); admin via Access or an admin token; create rate limit.
- Strict CSP with a per-request nonce, no-referrer, HSTS.
