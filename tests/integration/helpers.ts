import { env, SELF } from "cloudflare:test";
import { toBase64Url as toB64u } from "../../src/shared/crypto/base64url";

export { toB64u };

export const ORIGIN = "https://example.com";

/** `n` random bytes; getRandomValues caps one call at 65,536 bytes. */
const randomBytes = (n: number) => {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 65_536) crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65_536)));
  return out;
};

/** A blob the server accepts: version byte + 12-byte IV + `bodyBytes` opaque bytes (tag included). */
export const blob = (bodyBytes = 64, version = 1) => {
  const bytes = randomBytes(1 + 12 + bodyBytes);
  bytes[0] = version;
  return toB64u(bytes);
};

export const token = () => toB64u(randomBytes(32));

/** Independent of the Worker's own hashing, so a bug there cannot hide behind the same code here. */
export async function sha256Hex(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A fresh client address, so tests that create pastes never share a rate-limit key by accident. */
export const randomIp = () => Array.from(crypto.getRandomValues(new Uint8Array(4))).join(".");

export const postPaste = (body: unknown, contentType = "application/json", ip = randomIp()) =>
  SELF.fetch(`${ORIGIN}/api/pastes`, {
    method: "POST",
    headers: { "content-type": contentType, "cf-connecting-ip": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

export type Created = {
  id: string;
  url: string;
  ownerToken: string;
  createdAt: number;
  expiresAt: number | null;
  burn: boolean;
};

/** Creates a paste through the API and returns the response body plus the read token used. */
export async function createPaste(fields: Record<string, unknown> = {}) {
  const readToken = token();
  const res = await postPaste({ ciphertext: blob(), kind: "text", readToken, ...fields });
  if (res.status !== 201) throw new Error(`create failed: ${res.status} ${await res.text()}`);
  return { ...((await res.json()) as Created), readToken };
}

export const getPaste = (id: string, headers: Record<string, string> = {}) =>
  SELF.fetch(`${ORIGIN}/api/pastes/${id}`, { headers });

export const getMeta = (id: string, headers: Record<string, string> = {}) =>
  SELF.fetch(`${ORIGIN}/api/pastes/${id}/meta`, { headers });

export const deletePaste = (id: string, headers: Record<string, string> = {}) =>
  SELF.fetch(`${ORIGIN}/api/pastes/${id}`, { method: "DELETE", headers });

export type Row = {
  id: string;
  ciphertext: string;
  size: number;
  kind: string;
  burn: number;
  read_token_hash: string;
  owner_token_hash: string;
  created_at: number;
  expires_at: number | null;
};

export const row = (id: string) => env.DB.prepare("SELECT * FROM pastes WHERE id = ?").bind(id).first<Row>();

export const counter = async () =>
  (await env.DB.prepare("SELECT value FROM counters WHERE name = 'pastes_created'").first<{
    value: number;
  }>())!.value;

/** Inserts a row directly, bypassing the API (for expired rows). */
export const insertRow = (id: string, expiresAt: number | null, readTokenHash = "x", burn = 0) =>
  env.DB.prepare(
    `INSERT INTO pastes (id, ciphertext, size, kind, burn, read_token_hash, owner_token_hash, created_at, expires_at)
     VALUES (?, 'AQ', 1, 'text', ?, ?, 'y', 0, ?)`,
  )
    .bind(id, burn, readTokenHash, expiresAt)
    .run();

export async function resetDb() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM pastes"),
    env.DB.prepare("UPDATE counters SET value = 0 WHERE name = 'pastes_created'"),
  ]);
}
