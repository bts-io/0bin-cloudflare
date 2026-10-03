/**
 * Pure helpers for the view page (docs/spec.md 8.2, 8.5): key parsing, labels, line splitting and the
 * highlighting size rules. No DOM, no network, so they are unit-tested in Node.
 */
import { IKM_B64_LENGTH, PasteCryptoError } from "../../shared/crypto";
import { Id } from "../../shared/schemas/paste";
import { ApiError } from "./api";
import { LANGUAGES } from "./languages";

/** Text larger than this is shown plain (spec 8.5). */
export const HIGHLIGHT_MAX_BYTES = 500 * 1024;
/** Auto-detection only looks at this much of the text (spec 8.5). */
export const AUTO_SAMPLE_CHARS = 100 * 1024;

/** Only these get an inline preview; SVG can carry script, so it is download-only like everything else. */
const PREVIEW_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);

const KEY_SHAPE = new RegExp(`^[A-Za-z0-9_-]{${IKM_B64_LENGTH}}$`);

/** The link secret from `location.hash`, or null when it is missing or not exactly 43 base64url chars. */
export function parseKey(hash: string): string | null {
  const key = hash.startsWith("#") ? hash.slice(1) : hash;
  return KEY_SHAPE.test(key) ? key : null;
}

export const isPasteId = (id: string) => Id.safeParse(id).success;

/** "expires in 3h", "never expires"; a paste past its time is about to vanish, so it says so. */
export function expiryText(expiresAt: number | null, now = Date.now()): string {
  if (expiresAt === null) return "never expires";
  const minutes = Math.floor((expiresAt - now) / 60_000);
  if (minutes < 1) return "expires in under a minute";
  if (minutes < 60) return `expires in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `expires in ${hours}h`;
  return `expires in ${Math.floor(hours / 24)}d`;
}

export const canPreview = (mime: string | undefined) => mime !== undefined && PREVIEW_MIMES.has(mime);

/**
 * The text as shown and as the highlighter sees it: a final newline ends the last line instead of starting an
 * empty one, so plain and highlighted lines always line up.
 */
export const displayText = (text: string) => (text.endsWith("\n") ? text.slice(0, -1) : text);

export function splitLines(text: string): string[] {
  return text === "" ? [] : displayText(text).split("\n");
}

export const countLines = (text: string) => splitLines(text).length;

export const linesLabel = (n: number) => `${n} ${n === 1 ? "line" : "lines"}`;

const LANGUAGE_LABELS: ReadonlyMap<string, string> = new Map(LANGUAGES);

export const languageLabel = (lang: string) => LANGUAGE_LABELS.get(lang) ?? lang;

export type HighlightPlan = { mode: "none" } | { mode: "language"; language: string } | { mode: "auto" };

/**
 * How to highlight a text body: never above the size cap or for "plaintext", the author's language when it is
 * one we load, otherwise auto-detection.
 */
export function highlightPlan(byteLength: number, lang: string | undefined): HighlightPlan {
  if (byteLength > HIGHLIGHT_MAX_BYTES || lang === "plaintext") return { mode: "none" };
  if (lang && lang !== "auto" && LANGUAGE_LABELS.has(lang)) return { mode: "language", language: lang };
  return { mode: "auto" };
}

const HLJS_TOKEN = /<span class="[^"<>]*">|<\/span>|\n|[^<\n]+|</g;

/**
 * Splits highlight.js output into one HTML string per line. Spans can cross newlines (block comments, strings),
 * so every line closes the spans still open and the next one reopens them. Only highlight.js's own span tags
 * and its already-escaped text pass through; any other `<` is escaped, so no other markup can appear.
 */
export function splitHighlighted(html: string): string[] {
  const lines: string[] = [];
  const open: string[] = [];
  let line = "";
  for (const [token] of html.matchAll(HLJS_TOKEN)) {
    if (token === "\n") {
      lines.push(line + "</span>".repeat(open.length));
      line = open.join("");
    } else if (token.startsWith("<span")) {
      open.push(token);
      line += token;
    } else if (token === "</span>" && open.length > 0) {
      open.pop();
      line += token;
    } else {
      line += token.startsWith("<") ? `&lt;${token.slice(1)}` : token;
    }
  }
  lines.push(line + "</span>".repeat(open.length));
  return lines;
}

/** What a failed load shows: the one not-found message, the bad-key message, or a generic retryable error. */
export function viewFailure(err: unknown): "not-found" | "bad-key" | "failed" {
  if (err instanceof ApiError && err.status === 404) return "not-found";
  if (err instanceof PasteCryptoError) return "bad-key";
  return "failed";
}
