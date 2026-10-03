/** Random ids and tokens, token hashing and blob checks. The server never decodes more than the version byte. */
import { fromBase64Url, toBase64Url } from "../../shared/crypto/base64url";

/** `n` random bytes as base64url without padding (9 bytes -> 12 chars, 32 bytes -> 43 chars). */
export const randomB64u = (n: number) => toBase64Url(crypto.getRandomValues(new Uint8Array(n)));

/** Lower-case hex SHA-256 of the UTF-8 string, the only form of a token that reaches D1. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Decoded byte length of unpadded base64url, or null when the length cannot be valid (`len % 4 === 1`). */
export const decodedLength = (b64u: string) =>
  b64u.length % 4 === 1 ? null : Math.floor((b64u.length * 3) / 4);

/** Format version of a blob: its first byte, read from the first 4 base64url chars. */
export const versionByte = (b64u: string) => fromBase64Url(b64u.slice(0, 4))[0];
