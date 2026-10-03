import { fromBase64Url, toBase64Url } from "./base64url";
import { HKDF_INFO_ENC, HKDF_INFO_READ, IKM_B64_LENGTH, IKM_BYTES, READ_TOKEN_BYTES } from "./constants";
import { PasteCryptoError } from "./errors";

const utf8 = new TextEncoder();

/** A fresh link secret: 32 random bytes as 43 base64url chars. Lives only in the URL fragment. */
export function generateIkm(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(IKM_BYTES)));
}

/** Decodes an ikm, rejecting anything that is not exactly 32 bytes in 43 chars (e.g. a truncated link). */
function decodeIkm(ikm: string): Uint8Array<ArrayBuffer> {
  if (ikm.length !== IKM_B64_LENGTH) throw new PasteCryptoError("bad_encoding", "bad key length");
  const bytes = fromBase64Url(ikm);
  if (bytes.length !== IKM_BYTES) throw new PasteCryptoError("bad_encoding", "bad key length");
  return bytes;
}

/** HKDF-SHA256 with empty salt; the info string separates the key from the read token. */
async function hkdfKeyMaterial(ikm: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", decodeIkm(ikm), "HKDF", false, ["deriveKey", "deriveBits"]);
}

function hkdfParams(info: string) {
  // The copy pins the buffer type to ArrayBuffer, which the DOM and Workers typings both accept.
  return { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new Uint8Array(utf8.encode(info)) };
}

/** AES-256-GCM key for this paste. Non-extractable: page script can use it but never read it out. */
export async function deriveEncryptionKey(ikm: string): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    hkdfParams(HKDF_INFO_ENC),
    await hkdfKeyMaterial(ikm),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Proof of key knowledge for the server; independent of the encryption key (different info). */
export async function deriveReadToken(ikm: string): Promise<string> {
  const bits = await crypto.subtle.deriveBits(
    hkdfParams(HKDF_INFO_READ),
    await hkdfKeyMaterial(ikm),
    READ_TOKEN_BYTES * 8,
  );
  return toBase64Url(new Uint8Array(bits));
}
