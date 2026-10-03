import { describe, expect, it } from "vitest";
import {
  AAD_PREFIX,
  buildCreateRequest,
  decryptPaste,
  deriveReadToken,
  encryptPaste,
  FORMAT_VERSION,
  fromBase64Url,
  generateIkm,
  HEADER_LIMITS,
  HKDF_INFO_ENC,
  IV_BYTES,
  MAX_INFLATED_BYTES,
  PasteCryptoError,
  toBase64Url,
} from "../../src/shared/crypto";

const B64U_43 = /^[A-Za-z0-9_-]{43}$/;

/** Test-only: the same HKDF derivation as the module, but extractable, so the key bytes can be compared. */
async function rawEncryptionKey(ikm: string): Promise<string> {
  const material = await crypto.subtle.importKey("raw", fromBase64Url(ikm), "HKDF", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(HKDF_INFO_ENC),
    },
    material,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"],
  );
  return toBase64Url(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
}

/** Test-only: a valid, authenticated blob around an arbitrary header, bypassing encryptPaste's checks. */
async function craftBlob(ikm: string, kind: "text" | "file", header: object): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(header));
  const plain = new Uint8Array(4 + json.length);
  new DataView(plain.buffer).setUint32(0, json.length);
  plain.set(json, 4);
  const packed = await new Response(
    new Blob([plain]).stream().pipeThrough(new CompressionStream("deflate-raw")),
  ).arrayBuffer();
  const key = await crypto.subtle.importKey(
    "raw",
    fromBase64Url(await rawEncryptionKey(ikm)),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const additionalData = new TextEncoder().encode(AAD_PREFIX + kind);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData }, key, packed),
  );
  const blob = new Uint8Array(1 + IV_BYTES + ct.length);
  blob[0] = FORMAT_VERSION;
  blob.set(iv, 1);
  blob.set(ct, 1 + IV_BYTES);
  return toBase64Url(blob);
}

function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  // getRandomValues fills at most 65536 bytes per call.
  for (let i = 0; i < length; i += 65536) crypto.getRandomValues(out.subarray(i, i + 65536));
  return out;
}

function flipByte(ciphertext: string, index: number): string {
  const blob = fromBase64Url(ciphertext);
  blob[index] ^= 0x01;
  return toBase64Url(blob);
}

describe("round trip", () => {
  it("text with title and lang", async () => {
    const text = "héllo wörld\n".repeat(1000) + "🔐";
    const p = await encryptPaste({ kind: "text", body: text, title: "Notes", lang: "python" });
    const out = await decryptPaste(p.ikm, p.ciphertext, "text");
    expect(new TextDecoder().decode(out.body)).toBe(text);
    expect(out.header).toEqual({ v: 1, kind: "text", title: "Notes", lang: "python" });
    expect(p.kind).toBe("text");
  });

  it("1 MiB of random binary with name and mime", async () => {
    const bytes = randomBytes(1024 * 1024);
    const p = await encryptPaste({
      kind: "file",
      body: bytes,
      title: "dump",
      name: "data.bin",
      mime: "application/octet-stream",
    });
    const out = await decryptPaste(p.ikm, p.ciphertext, "file");
    expect(out.body).toEqual(bytes);
    expect(out.header).toEqual({
      v: 1,
      kind: "file",
      title: "dump",
      name: "data.bin",
      mime: "application/octet-stream",
    });
  });

  it("blob layout is 0x01 || iv(12) || ct+tag, base64url without padding", async () => {
    const p = await encryptPaste({ kind: "text", body: "x" });
    expect(p.ciphertext).toMatch(/^[A-Za-z0-9_-]+$/);
    const blob = fromBase64Url(p.ciphertext);
    expect(blob[0]).toBe(0x01);
    expect(blob.length).toBeGreaterThanOrEqual(1 + IV_BYTES + 16);
  });
});

describe("tampering and wrong inputs throw", async () => {
  const p = await encryptPaste({ kind: "text", body: "secret content", title: "t" });
  const blobLength = fromBase64Url(p.ciphertext).length;

  const cases: Array<[string, number]> = [
    ["IV", 1],
    ["IV (last byte)", IV_BYTES],
    ["ciphertext", 1 + IV_BYTES],
    ["tag", blobLength - 1],
    ["tag (first byte)", blobLength - 16],
  ];
  it.each(cases)("one flipped byte in the %s", async (_, index) => {
    await expect(decryptPaste(p.ikm, flipByte(p.ciphertext, index), "text")).rejects.toMatchObject({
      code: "decrypt_failed",
    });
  });

  it("a different ikm", async () => {
    await expect(decryptPaste(generateIkm(), p.ciphertext, "text")).rejects.toMatchObject({
      code: "decrypt_failed",
    });
  });

  it("a changed kind (AAD)", async () => {
    await expect(decryptPaste(p.ikm, p.ciphertext, "file")).rejects.toMatchObject({ code: "decrypt_failed" });
  });

  it("an unknown version byte", async () => {
    await expect(decryptPaste(p.ikm, flipByte(p.ciphertext, 0), "text")).rejects.toMatchObject({
      code: "bad_format",
    });
  });

  it("a truncated ikm", async () => {
    await expect(decryptPaste(p.ikm.slice(0, 42), p.ciphertext, "text")).rejects.toBeInstanceOf(
      PasteCryptoError,
    );
  });
});

describe("IV freshness", () => {
  it("same plaintext and ikm twice gives different IVs and blobs", async () => {
    const ikm = generateIkm();
    const a = await encryptPaste({ kind: "text", body: "same" }, ikm);
    const b = await encryptPaste({ kind: "text", body: "same" }, ikm);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    const ivA = fromBase64Url(a.ciphertext).subarray(1, 1 + IV_BYTES);
    const ivB = fromBase64Url(b.ciphertext).subarray(1, 1 + IV_BYTES);
    expect(ivA).not.toEqual(ivB);
    expect(new TextDecoder().decode((await decryptPaste(ikm, b.ciphertext, "text")).body)).toBe("same");
  });
});

describe("keys", () => {
  it("ikm is 43 base64url chars of 32 random bytes", () => {
    const ikm = generateIkm();
    expect(ikm).toMatch(B64U_43);
    expect(fromBase64Url(ikm)).toHaveLength(32);
    expect(generateIkm()).not.toBe(ikm);
  });

  it("read token is deterministic per ikm and differs from the ikm and the key bytes", async () => {
    const ikm = generateIkm();
    const token = await deriveReadToken(ikm);
    expect(token).toMatch(B64U_43);
    expect(await deriveReadToken(ikm)).toBe(token);
    expect(await deriveReadToken(generateIkm())).not.toBe(token);
    expect(token).not.toBe(ikm);
    const rawKey = await rawEncryptionKey(ikm);
    expect(fromBase64Url(rawKey)).toHaveLength(32);
    expect(token).not.toBe(rawKey);
    expect(rawKey).not.toBe(ikm);
  });

  it("encryptPaste returns the read token derived from its ikm", async () => {
    const p = await encryptPaste({ kind: "text", body: "x" });
    expect(p.readToken).toBe(await deriveReadToken(p.ikm));
  });
});

describe("buildCreateRequest", () => {
  it("holds exactly the spec 5.1 fields and no secret", async () => {
    const p = await encryptPaste({ kind: "file", body: new Uint8Array([1, 2, 3]), name: "a.bin" });
    const body = buildCreateRequest(p, { expiry: "1w", burn: true });
    expect(Object.keys(body).sort()).toEqual(["burn", "ciphertext", "expiry", "kind", "readToken"]);
    expect(body).toEqual({
      ciphertext: p.ciphertext,
      kind: "file",
      expiry: "1w",
      burn: true,
      readToken: p.readToken,
    });
    const rawKey = await rawEncryptionKey(p.ikm);
    const json = JSON.stringify(body);
    for (const value of Object.values(body)) {
      expect(value).not.toBe(p.ikm);
      expect(value).not.toBe(rawKey);
    }
    expect(json).not.toContain(p.ikm);
    expect(json).not.toContain(rawKey);
  });

  it("rejects burn with never, allows never without burn", async () => {
    const p = await encryptPaste({ kind: "text", body: "x" });
    expect(() => buildCreateRequest(p, { expiry: "never", burn: true })).toThrow(PasteCryptoError);
    expect(buildCreateRequest(p, { expiry: "never", burn: false }).expiry).toBe("never");
  });

  it("rejects an unknown expiry", async () => {
    const p = await encryptPaste({ kind: "text", body: "x" });
    expect(() => buildCreateRequest(p, { expiry: "2d" as never, burn: false })).toThrow(PasteCryptoError);
  });
});

describe("inflate cap", () => {
  it("a blob that inflates past 16 MiB throws too_large", async () => {
    // 17 MiB of zeros deflates to a few KiB: a valid, authenticated decompression bomb.
    const bomb = new Uint8Array(MAX_INFLATED_BYTES + 1024 * 1024);
    const p = await encryptPaste({ kind: "file", body: bomb });
    expect(fromBase64Url(p.ciphertext).length).toBeLessThan(64 * 1024);
    await expect(decryptPaste(p.ikm, p.ciphertext, "file")).rejects.toMatchObject({ code: "too_large" });
  });

  it("content just under the cap still decrypts", async () => {
    const body = new Uint8Array(MAX_INFLATED_BYTES - 1024);
    const p = await encryptPaste({ kind: "file", body });
    expect((await decryptPaste(p.ikm, p.ciphertext, "file")).body).toHaveLength(body.length);
  });
});

describe("header limits", () => {
  const over = (n: number) => "a".repeat(n + 1);
  it.each([
    ["title", { title: over(HEADER_LIMITS.title) }],
    ["name", { name: over(HEADER_LIMITS.name) }],
    ["mime", { mime: over(HEADER_LIMITS.mime) }],
    ["lang", { lang: over(HEADER_LIMITS.lang) }],
  ])("over-long %s throws", async (_, fields) => {
    await expect(encryptPaste({ kind: "text", body: "x", ...fields })).rejects.toMatchObject({
      code: "bad_header",
    });
  });

  it("fields at the limit pass", async () => {
    const p = await encryptPaste({
      kind: "file",
      body: "x",
      title: "t".repeat(HEADER_LIMITS.title),
      name: "n".repeat(HEADER_LIMITS.name),
      mime: "m".repeat(HEADER_LIMITS.mime),
      lang: "l".repeat(HEADER_LIMITS.lang),
    });
    expect((await decryptPaste(p.ikm, p.ciphertext, "file")).header.name).toHaveLength(HEADER_LIMITS.name);
  });

  // The field limits alone keep encrypted headers under 4 KiB, so the JSON cap only bites on a crafted
  // blob: build one by hand with the same key derivation and check decrypt re-validates.
  it("decrypt rejects a crafted header over 4 KiB", async () => {
    const ikm = generateIkm();
    const ciphertext = await craftBlob(ikm, "text", { v: 1, kind: "text", pad: "a".repeat(5000) });
    await expect(decryptPaste(ikm, ciphertext, "text")).rejects.toMatchObject({ code: "bad_header" });
  });

  it("decrypt rejects a crafted over-long title", async () => {
    const ikm = generateIkm();
    const ciphertext = await craftBlob(ikm, "text", { v: 1, kind: "text", title: over(HEADER_LIMITS.title) });
    await expect(decryptPaste(ikm, ciphertext, "text")).rejects.toMatchObject({ code: "bad_header" });
  });

  it("decrypt rejects a header whose kind disagrees with the AAD kind", async () => {
    const ikm = generateIkm();
    const ciphertext = await craftBlob(ikm, "text", { v: 1, kind: "file" });
    await expect(decryptPaste(ikm, ciphertext, "text")).rejects.toMatchObject({ code: "bad_header" });
  });
});

describe("base64url", () => {
  it("round trips every byte value and rejects padding or the standard alphabet", () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    const text = toBase64Url(all);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fromBase64Url(text)).toEqual(all);
    expect(() => fromBase64Url("AAA=")).toThrow(PasteCryptoError);
    expect(() => fromBase64Url("a+b/")).toThrow(PasteCryptoError);
    expect(() => fromBase64Url("AAAAA")).toThrow(PasteCryptoError);
  });
});
