import { HEADER_LIMITS, HEADER_VERSION, KINDS } from "./constants";
import { PasteCryptoError } from "./errors";

export type PasteKind = (typeof KINDS)[number];

/** Encrypted metadata. Rendered as text only, never as HTML. */
export interface PasteHeader {
  v: typeof HEADER_VERSION;
  kind: PasteKind;
  title?: string;
  lang?: string;
  name?: string;
  mime?: string;
}

const utf8 = new TextEncoder();
// fatal: a header that is not valid UTF-8 is corrupt, not something to patch with U+FFFD.
const utf8Strict = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
const OPTIONAL_FIELDS = ["title", "lang", "name", "mime"] as const;
const LENGTH_PREFIX_BYTES = 4;

/**
 * Validates a header on both sides of the wire and returns a copy holding only the known fields.
 * String limits count UTF-16 code units (JS `length`, same as an input's maxLength).
 */
export function validateHeader(value: unknown): PasteHeader {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PasteCryptoError("bad_header", "header is not an object");
  }
  const raw = value as Record<string, unknown>;
  if (raw.v !== HEADER_VERSION) throw new PasteCryptoError("bad_header", "unknown header version");
  if (!KINDS.includes(raw.kind as PasteKind)) throw new PasteCryptoError("bad_header", "bad kind");
  const header: PasteHeader = { v: HEADER_VERSION, kind: raw.kind as PasteKind };
  for (const field of OPTIONAL_FIELDS) {
    const v = raw[field];
    if (v === undefined) continue;
    if (typeof v !== "string") throw new PasteCryptoError("bad_header", `${field} is not a string`);
    if (v.length > HEADER_LIMITS[field]) throw new PasteCryptoError("bad_header", `${field} too long`);
    header[field] = v;
  }
  return header;
}

/** plain = u32be(byteLength(header)) || header JSON || body */
export function packEnvelope(header: PasteHeader, body: Uint8Array): Uint8Array<ArrayBuffer> {
  const json = utf8.encode(JSON.stringify(validateHeader(header)));
  if (json.length > HEADER_LIMITS.jsonBytes) throw new PasteCryptoError("bad_header", "header too large");
  const plain = new Uint8Array(LENGTH_PREFIX_BYTES + json.length + body.length);
  new DataView(plain.buffer).setUint32(0, json.length);
  plain.set(json, LENGTH_PREFIX_BYTES);
  plain.set(body, LENGTH_PREFIX_BYTES + json.length);
  return plain;
}

/** Inverse of packEnvelope; re-checks every header limit since the bytes came off the network. */
export function unpackEnvelope(plain: Uint8Array): { header: PasteHeader; body: Uint8Array } {
  if (plain.length < LENGTH_PREFIX_BYTES) throw new PasteCryptoError("bad_format", "envelope too short");
  const length = new DataView(plain.buffer, plain.byteOffset, plain.byteLength).getUint32(0);
  if (length > HEADER_LIMITS.jsonBytes) throw new PasteCryptoError("bad_header", "header too large");
  const end = LENGTH_PREFIX_BYTES + length;
  if (end > plain.length) throw new PasteCryptoError("bad_format", "header length past end");
  let parsed: unknown;
  try {
    parsed = JSON.parse(utf8Strict.decode(plain.subarray(LENGTH_PREFIX_BYTES, end)));
  } catch {
    throw new PasteCryptoError("bad_header", "header is not JSON");
  }
  return { header: validateHeader(parsed), body: plain.subarray(end) };
}
