import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/client/lib/api";
import {
  canSubmit,
  clampFileName,
  createErrorMessage,
  decodedBytes,
  EXPIRY_OPTIONS,
  expiryForBurn,
  expiryLabel,
  fitsLimit,
  formatCount,
  MAX_FILE_BYTES,
  parseClonePrefill,
  pastedFileName,
  readPickedFile,
  TOO_LARGE_MESSAGE,
  toPasteInput,
} from "../../src/client/lib/create";
import { formatBytes } from "../../src/client/lib/format";
import { EXPIRIES, MAX_INFLATED_BYTES, PasteCryptoError } from "../../src/shared/crypto";
import { MAX_CIPHERTEXT_BYTES } from "../../src/shared/schemas/paste";

describe("expiry and burn", () => {
  it("offers every expiry in order with readable labels, 1 day included", () => {
    expect(EXPIRY_OPTIONS.map(([v]) => v)).toEqual([...EXPIRIES]);
    expect(EXPIRY_OPTIONS.find(([v]) => v === "1d")?.[1]).toBe("1 day");
  });

  it("moves never to 1d when burn is ticked and leaves everything else alone", () => {
    expect(expiryForBurn("never", true)).toBe("1w");
    expect(expiryForBurn("never", false)).toBe("never");
    for (const e of ["1h", "1d", "1w", "1m"] as const) expect(expiryForBurn(e, true)).toBe(e);
  });

  it("labels remaining time for history entries", () => {
    const now = 1_000_000_000;
    expect(expiryLabel(null, now)).toBe("never expires");
    expect(expiryLabel(now - 1, now)).toBe("expired");
    expect(expiryLabel(now + 5 * 60_000, now)).toBe("5m left");
    expect(expiryLabel(now + 3 * 3_600_000, now)).toBe("3h left");
    expect(expiryLabel(now + 7 * 86_400_000, now)).toBe("7d left");
  });
});

describe("size checks", () => {
  it("measures base64url without padding as decoded bytes", () => {
    expect(decodedBytes("")).toBe(0);
    expect(decodedBytes("AAAA")).toBe(3);
    expect(decodedBytes("AAAAAA")).toBe(4);
    expect(decodedBytes("AAAAAAA")).toBe(5);
  });

  it("accepts a blob of exactly the limit and refuses one byte more", () => {
    const b64ForBytes = (n: number) => "A".repeat(Math.ceil((n * 4) / 3));
    expect(fitsLimit(b64ForBytes(MAX_CIPHERTEXT_BYTES))).toBe(true);
    expect(fitsLimit(b64ForBytes(MAX_CIPHERTEXT_BYTES + 1))).toBe(false);
    expect(fitsLimit(b64ForBytes(10), 9)).toBe(false);
  });

  it("caps files below the viewer's inflate limit", () => {
    expect(MAX_FILE_BYTES).toBeLessThan(MAX_INFLATED_BYTES);
  });

  it("formats sizes and counts", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KiB");
    expect(formatBytes(MAX_CIPHERTEXT_BYTES)).toBe("1.00 MiB");
    expect(formatCount(1284)).toBe("1,284");
  });
});

describe("file to input mapping", () => {
  const form = { text: "hello", title: "  My notes  ", lang: "python", file: null };

  it("builds a text input with a trimmed title and the language", () => {
    expect(toPasteInput(form)).toEqual({ kind: "text", body: "hello", title: "My notes", lang: "python" });
    expect(toPasteInput({ ...form, title: "   " }).title).toBeUndefined();
  });

  it("builds a file input from the picked file and drops text and language", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const input = toPasteInput({ ...form, file: { name: "a.bin", mime: "application/x-thing", bytes } });
    expect(input).toEqual({
      kind: "file",
      body: bytes,
      title: "My notes",
      name: "a.bin",
      mime: "application/x-thing",
    });
  });

  it("needs text or a file to submit", () => {
    expect(canSubmit({ text: "  \n", file: null })).toBe(false);
    expect(canSubmit({ text: "x", file: null })).toBe(true);
    expect(canSubmit({ text: "", file: { name: "a", mime: "b", bytes: new Uint8Array() } })).toBe(true);
  });

  it("reads a picked file with its name, type and bytes", async () => {
    const picked = await readPickedFile(
      new File([new Uint8Array([7, 8])], "photo.jpg", { type: "image/jpeg" }),
    );
    expect(picked).toEqual({ name: "photo.jpg", mime: "image/jpeg", bytes: new Uint8Array([7, 8]) });
  });

  it("falls back to octet-stream and dates clipboard images", async () => {
    const untyped = await readPickedFile(new File(["x"], "blob"));
    expect(untyped.mime).toBe("application/octet-stream");
    const pasted = await readPickedFile(
      new File(["x"], "image.png", { type: "image/png" }),
      true,
      new Date("2026-10-03T12:34:56Z"),
    );
    expect(pasted.name).toBe("pasted-20261003-123456.png");
    expect(pastedFileName("image/svg+xml", new Date("2026-01-02T03:04:05Z"))).toBe(
      "pasted-20260102-030405.svg",
    );
  });

  it("clamps long file names to the header limit and keeps the extension", () => {
    const long = `${"n".repeat(300)}.tar.gz`;
    const clamped = clampFileName(long);
    expect(clamped).toHaveLength(255);
    expect(clamped.endsWith(".gz")).toBe(true);
    expect(clampFileName("   ")).toBe("file");
    expect(clampFileName("short.txt")).toBe("short.txt");
  });
});

describe("clone prefill", () => {
  it("parses text, title and a known language", () => {
    expect(parseClonePrefill(JSON.stringify({ text: "a", title: "t", lang: "rust" }))).toEqual({
      text: "a",
      title: "t",
      lang: "rust",
    });
  });

  it("defaults missing fields and replaces unknown languages with auto", () => {
    expect(parseClonePrefill(JSON.stringify({ text: "a" }))).toEqual({ text: "a", title: "", lang: "auto" });
    expect(parseClonePrefill(JSON.stringify({ text: "a", lang: "<script>" }))?.lang).toBe("auto");
    expect(parseClonePrefill(JSON.stringify({ text: "a", title: "x".repeat(150) }))?.title).toHaveLength(100);
  });

  it("ignores missing, malformed or wrongly shaped values", () => {
    expect(parseClonePrefill(null)).toBeNull();
    expect(parseClonePrefill("")).toBeNull();
    expect(parseClonePrefill("{not json")).toBeNull();
    expect(parseClonePrefill(JSON.stringify({ title: "no text" }))).toBeNull();
    expect(parseClonePrefill(JSON.stringify([1, 2]))).toBeNull();
  });
});

describe("error messages", () => {
  it("says plainly when creating is disabled or the user is signed out", () => {
    expect(createErrorMessage(new ApiError(404, "not_found"))).toBe(
      "Creating pastes is disabled on this server.",
    );
    expect(createErrorMessage(new ApiError(401, "unauthorized"))).toMatch(/team key/);
  });

  it("maps size, validation, rate limit and other server errors", () => {
    expect(createErrorMessage(new ApiError(413, "payload_too_large"))).toBe(TOO_LARGE_MESSAGE);
    expect(createErrorMessage(new ApiError(400, "invalid_request"))).toMatch(/invalid/);
    expect(createErrorMessage(new ApiError(429, "rate_limited"))).toMatch(/Too many/);
    expect(createErrorMessage(new ApiError(500, "unknown"))).toMatch(/error 500/);
  });

  it("maps network and crypto failures", () => {
    expect(createErrorMessage(new TypeError("Failed to fetch"))).toMatch(/Network error/);
    expect(createErrorMessage(new PasteCryptoError("bad_header"))).toMatch(/too long/);
    expect(createErrorMessage(new PasteCryptoError("invalid_options"))).toMatch(/Encryption failed/);
    expect(createErrorMessage(new Error("x"))).toMatch(/Something went wrong/);
  });
});
