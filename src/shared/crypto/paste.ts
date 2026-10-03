import { fromBase64Url, toBase64Url } from "./base64url";
import { deflate, inflate } from "./compression";
import { AAD_PREFIX, FORMAT_VERSION, IV_BYTES, KINDS, TAG_BITS } from "./constants";
import { type PasteHeader, type PasteKind, packEnvelope, unpackEnvelope } from "./envelope";
import { PasteCryptoError } from "./errors";
import { deriveEncryptionKey, deriveReadToken, generateIkm } from "./keys";

const utf8 = new TextEncoder();
const MIN_BLOB_BYTES = 1 + IV_BYTES + TAG_BITS / 8;

/** What the author typed or picked. Text bodies are encoded as UTF-8. */
export interface PasteInput {
  kind: PasteKind;
  body: string | Uint8Array;
  title?: string;
  lang?: string;
  name?: string;
  mime?: string;
}

/** `ikm` goes in the URL fragment only; the rest is what the server may see. */
export interface EncryptedPaste {
  ikm: string;
  readToken: string;
  ciphertext: string;
  kind: PasteKind;
}

export interface DecryptedPaste {
  header: PasteHeader;
  body: Uint8Array;
}

function aad(kind: PasteKind): Uint8Array<ArrayBuffer> {
  // The copy pins the buffer type to ArrayBuffer, which the DOM and Workers typings both accept.
  return new Uint8Array(utf8.encode(AAD_PREFIX + kind));
}

/**
 * Encrypts a paste under `ikm` (a fresh one when omitted).
 * blob = 0x01 || iv(12) || AES-GCM(deflate-raw(envelope)), sent as base64url.
 */
export async function encryptPaste(input: PasteInput, ikm: string = generateIkm()): Promise<EncryptedPaste> {
  const { kind, body, title, lang, name, mime } = input;
  const header: PasteHeader = { v: 1, kind, title, lang, name, mime };
  const bytes = typeof body === "string" ? utf8.encode(body) : body;
  const packed = await deflate(packEnvelope(header, bytes));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad(kind), tagLength: TAG_BITS },
      await deriveEncryptionKey(ikm),
      packed,
    ),
  );
  const blob = new Uint8Array(1 + IV_BYTES + ct.length);
  blob[0] = FORMAT_VERSION;
  blob.set(iv, 1);
  blob.set(ct, 1 + IV_BYTES);
  return { ikm, readToken: await deriveReadToken(ikm), ciphertext: toBase64Url(blob), kind };
}

/**
 * Decrypts a wire blob. `kind` is the server-reported kind; it is part of the AAD, so a relabelled
 * paste fails authentication, and the decrypted header must agree with it.
 */
export async function decryptPaste(
  ikm: string,
  ciphertext: string,
  kind: PasteKind,
): Promise<DecryptedPaste> {
  if (!KINDS.includes(kind)) throw new PasteCryptoError("bad_format", "bad kind");
  const blob = fromBase64Url(ciphertext);
  if (blob.length < MIN_BLOB_BYTES) throw new PasteCryptoError("bad_format", "blob too short");
  if (blob[0] !== FORMAT_VERSION) throw new PasteCryptoError("bad_format", "unknown blob version");
  const key = await deriveEncryptionKey(ikm);
  let packed: Uint8Array<ArrayBuffer>;
  try {
    packed = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: blob.subarray(1, 1 + IV_BYTES),
          additionalData: aad(kind),
          tagLength: TAG_BITS,
        },
        key,
        blob.subarray(1 + IV_BYTES),
      ),
    );
  } catch {
    throw new PasteCryptoError("decrypt_failed", "wrong key or corrupted paste");
  }
  const result = unpackEnvelope(await inflate(packed));
  if (result.header.kind !== kind) throw new PasteCryptoError("bad_header", "header kind mismatch");
  return result;
}
