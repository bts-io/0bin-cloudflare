/**
 * Response headers for every Worker response (spec 4): the paste key lives in `location.hash`, so pages get a
 * strict nonce-based CSP and nothing may leak the URL through `Referer`.
 */
const BASE_HEADERS = {
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Frame-Options": "DENY",
} as const;

/** 128 random bits, base64: a fresh value per page render. */
export function createNonce() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

const contentSecurityPolicy = (nonce: string) =>
  [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self'",
    "img-src 'self' blob: data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

/** Copies `response` with the base headers, plus the CSP for HTML documents rendered with `nonce`. */
export function withSecurityHeaders(response: Response, nonce?: string) {
  const res = new Response(response.body, response);
  for (const [name, value] of Object.entries(BASE_HEADERS)) res.headers.set(name, value);
  if (nonce && res.headers.get("content-type")?.includes("text/html"))
    res.headers.set("Content-Security-Policy", contentSecurityPolicy(nonce));
  return res;
}
