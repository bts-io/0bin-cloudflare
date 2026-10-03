/**
 * Pure helpers for the create page (docs/spec.md 6.1, 7.1, 8.1). No DOM or storage access here, so they run in
 * unit tests and never during SSR by accident.
 */
import { z } from "zod";
import {
  type Expiry,
  HEADER_LIMITS,
  MAX_INFLATED_BYTES,
  PasteCryptoError,
  type PasteInput,
} from "../../shared/crypto";
import { MAX_CIPHERTEXT_BYTES } from "../../shared/schemas/paste";
import { ApiError } from "./api";
import { formatBytes } from "./format";
import { LANGUAGES } from "./languages";

export const DEFAULT_EXPIRY: Expiry = "1d";

export const EXPIRY_OPTIONS: ReadonlyArray<readonly [Expiry, string]> = [
  ["1h", "1 hour"],
  ["1d", "1 day"],
  ["1w", "1 week"],
  ["1m", "1 month"],
  ["never", "never"],
];

/** Burn pastes must expire: ticking burn while on `never` falls back to the default expiry. */
/** Spec 6.1: ticking burn while on "never" moves to one week, long enough for the reader to get to it. */
export const BURN_FALLBACK_EXPIRY: Expiry = "1w";

export const expiryForBurn = (expiry: Expiry, burn: boolean): Expiry =>
  burn && expiry === "never" ? BURN_FALLBACK_EXPIRY : expiry;

/** Bytes of a base64url (no padding) string once decoded: what the server measures against its limit. */
export const decodedBytes = (b64url: string): number => Math.floor((b64url.length * 3) / 4);

export const fitsLimit = (ciphertext: string, max = MAX_CIPHERTEXT_BYTES): boolean =>
  decodedBytes(ciphertext) <= max;

export const formatCount = (n: number): string => n.toLocaleString("en-US");

/**
 * Files above this are refused before they are read into memory: the viewer will not inflate an envelope larger
 * than MAX_INFLATED_BYTES, so such a paste could never be opened.
 */
export const MAX_FILE_BYTES = MAX_INFLATED_BYTES - 4 - HEADER_LIMITS.jsonBytes;

/** Short remaining-time label for a history entry. */
export function expiryLabel(expiresAt: number | null, now = Date.now()): string {
  if (expiresAt === null) return "never expires";
  const minutes = Math.ceil((expiresAt - now) / 60_000);
  if (minutes <= 0) return "expired";
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h left` : `${Math.floor(hours / 24)}d left`;
}

/** The bits of a picked, dropped or pasted file the envelope needs. */
export interface PickedFile {
  name: string;
  mime: string;
  bytes: Uint8Array;
}

/** A clipboard image has no useful name ("image.png" at best), so it gets a dated one. */
export function pastedFileName(mime: string, now = new Date()): string {
  const ext = mime.split("/")[1]?.split(/[+;]/)[0] || "bin";
  const stamp = now.toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  return `pasted-${stamp}.${ext}`;
}

/**
 * Reads a picked, dropped or pasted file. Clipboard images arrive with a generic name ("image.png"), so they get a
 * dated one; a missing type becomes application/octet-stream.
 */
export async function readPickedFile(
  file: File,
  fromClipboard = false,
  now = new Date(),
): Promise<PickedFile> {
  const mime = (file.type || "application/octet-stream").slice(0, HEADER_LIMITS.mime);
  const name = fromClipboard ? pastedFileName(mime, now) : clampFileName(file.name);
  return { name, mime, bytes: new Uint8Array(await file.arrayBuffer()) };
}

/** Keeps the extension when a long file name must be cut to the header limit. */
export function clampFileName(name: string, max = HEADER_LIMITS.name): string {
  const clean = name.trim() || "file";
  if (clean.length <= max) return clean;
  const dot = clean.lastIndexOf(".");
  const ext = dot > 0 && clean.length - dot <= 16 ? clean.slice(dot) : "";
  return clean.slice(0, max - ext.length) + ext;
}

const blankToUndefined = (s: string | undefined) => (s?.trim() ? s.trim() : undefined);

/** Maps the form to the envelope input: a file wins over text, and the language only applies to text. */
export function toPasteInput(form: {
  text: string;
  title: string;
  lang: string;
  file: PickedFile | null;
}): PasteInput {
  const title = blankToUndefined(form.title)?.slice(0, HEADER_LIMITS.title);
  if (form.file) {
    const { bytes, name, mime } = form.file;
    return { kind: "file", body: bytes, title, name, mime };
  }
  return { kind: "text", body: form.text, title, lang: form.lang };
}

export const canSubmit = (form: { text: string; file: PickedFile | null }): boolean =>
  form.file !== null || form.text.trim().length > 0;

const LANGUAGE_IDS = new Set<string>(LANGUAGES.map(([id]) => id));

const ClonePayload = z.object({
  text: z.string(),
  title: z.string().optional(),
  lang: z.string().optional(),
});
export type ClonePrefill = { text: string; title: string; lang: string };

/** Parses `sessionStorage["0bin-cf:clone"]`; anything malformed is ignored, unknown languages become `auto`. */
export function parseClonePrefill(raw: string | null): ClonePrefill | null {
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = ClonePayload.safeParse(json);
  if (!parsed.success) return null;
  const { text, title, lang } = parsed.data;
  return {
    text,
    title: (title ?? "").slice(0, HEADER_LIMITS.title),
    lang: lang && LANGUAGE_IDS.has(lang) ? lang : "auto",
  };
}

export const TOO_LARGE_MESSAGE = `This paste is too large: it must fit in ${formatBytes(MAX_CIPHERTEXT_BYTES)} after compression and encryption.`;

/** One plain sentence per failure, for the inline error line. */
export function createErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 404:
        return "Creating pastes is disabled on this server.";
      case 401:
        return "This server needs the team key to create pastes.";
      case 413:
        return TOO_LARGE_MESSAGE;
      case 400:
        return "The server rejected this paste as invalid. Check the expiry option and try again.";
      case 429:
        return "Too many pastes in a short time. Wait a moment and try again.";
      default:
        return `The server could not save this paste (error ${err.status}). Try again.`;
    }
  }
  if (err instanceof PasteCryptoError) {
    return err.code === "bad_header"
      ? "The title or file name is too long to encrypt."
      : "Encryption failed in this browser.";
  }
  if (err instanceof TypeError) return "Network error: the server could not be reached.";
  return "Something went wrong. Try again.";
}
