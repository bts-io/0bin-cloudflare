import { PasteCryptoError } from "./errors";

const B64U = /^[A-Za-z0-9_-]*$/;
// String.fromCharCode spreads its arguments; chunking keeps 1 MiB blobs under the engine's arg limit.
const CHUNK = 0x8000;

/** base64url without padding (RFC 4648 section 5), the wire format for blobs, ikm and tokens. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Strict decode: rejects padding, standard-alphabet chars and impossible lengths. */
export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!B64U.test(text) || text.length % 4 === 1) {
    throw new PasteCryptoError("bad_encoding", "not base64url");
  }
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
