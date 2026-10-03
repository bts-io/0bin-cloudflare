import { createExecutionContext, env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CreatePasteResponse,
  EXPIRY_MS,
  MAX_CIPHERTEXT_B64,
  MAX_CIPHERTEXT_BYTES,
} from "../../src/shared/schemas/paste";
import worker from "../../src/worker/index";
import {
  blob,
  counter,
  insertRow,
  ORIGIN,
  postPaste,
  randomIp,
  resetDb,
  row,
  sha256Hex,
  token,
} from "./helpers";

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());

const valid = () => ({ ciphertext: blob(), kind: "text", readToken: token() });

describe("POST /api/pastes", () => {
  it("creates a paste and stores only token hashes", async () => {
    const body = valid();
    const res = await postPaste(body);
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    const created = CreatePasteResponse.parse(await res.json());
    expect(created.id).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(created.ownerToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.url).toBe(`/p/${created.id}`);
    expect(created.burn).toBe(false);

    const stored = (await row(created.id))!;
    expect(stored.read_token_hash).toBe(await sha256Hex(body.readToken));
    expect(stored.owner_token_hash).toBe(await sha256Hex(created.ownerToken));
    expect(stored.ciphertext).toBe(body.ciphertext);
    expect(stored.size).toBe(1 + 12 + 64);
    const columns = Object.values(stored).map(String);
    expect(columns.some((v) => v.includes(body.readToken) || v.includes(created.ownerToken))).toBe(false);
    expect(await counter()).toBe(1);
  });

  it.each(Object.entries(EXPIRY_MS))("sets expires_at for %s", async (expiry, ms) => {
    const res = await postPaste({ ...valid(), expiry });
    expect(res.status).toBe(201);
    const created = CreatePasteResponse.parse(await res.json());
    const stored = (await row(created.id))!;
    expect(stored.created_at).toBe(created.createdAt);
    expect(stored.expires_at).toBe(ms === null ? null : created.createdAt + ms);
    expect(created.expiresAt).toBe(stored.expires_at);
  });

  it("defaults to 1d and no burn", async () => {
    const created = CreatePasteResponse.parse(await (await postPaste(valid())).json());
    expect(created.expiresAt).toBe(created.createdAt + 86_400_000);
    expect((await row(created.id))!.burn).toBe(0);
  });

  it("accepts a blob exactly at the size limit", async () => {
    const res = await postPaste({ ...valid(), ciphertext: blob(MAX_CIPHERTEXT_BYTES - 13) });
    expect(res.status).toBe(201);
    const { id } = CreatePasteResponse.parse(await res.json());
    expect((await row(id))!.ciphertext.length).toBe(MAX_CIPHERTEXT_B64);
  });

  it.each([
    ["non-base64url ciphertext", { ciphertext: `${blob().slice(0, -1)}+` }],
    ["version byte 2", { ciphertext: blob(64, 2) }],
    ["blob under 29 bytes", { ciphertext: blob(15) }],
    ["impossible base64 length", { ciphertext: `${blob(62)}A` }],
    ["unknown field", { title: "secret title" }],
    ["burn with never", { burn: true, expiry: "never" }],
    ["unknown expiry", { expiry: "2d" }],
    ["unknown kind", { kind: "image" }],
    ["short read token", { readToken: "abc" }],
    ["missing read token", { readToken: undefined }],
  ])("rejects %s with 400", async (_name, override) => {
    const res = await postPaste({ ...valid(), ...override });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_request" });
    expect(await counter()).toBe(0);
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await postPaste("{not json");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_request" });
  });

  it("rejects a ciphertext over the limit with 413", async () => {
    const res = await postPaste({ ...valid(), ciphertext: blob(MAX_CIPHERTEXT_BYTES - 12) });
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: "payload_too_large" });
    expect(await counter()).toBe(0);
  });

  it("rejects a body over 1,500,000 bytes with 413", async () => {
    const res = await postPaste({ ...valid(), pad: "a".repeat(1_500_000) });
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: "payload_too_large" });
    expect(await counter()).toBe(0);
  });

  it("rejects non-JSON with 415", async () => {
    const res = await postPaste(JSON.stringify(valid()), "text/plain");
    expect(res.status).toBe(415);
    expect(await res.json()).toMatchObject({ error: "unsupported_media_type" });
    expect(await counter()).toBe(0);
  });

  it("counts every successful create", async () => {
    for (let i = 0; i < 3; i++) expect((await postPaste(valid())).status).toBe(201);
    expect(await counter()).toBe(3);
  });

  it("retries a fresh id on a primary-key collision", async () => {
    const taken = "AAAAAAAAAAAA"; // base64url of 9 zero bytes
    await insertRow(taken, null);
    const real = crypto.getRandomValues.bind(crypto);
    let forced = false;
    vi.spyOn(crypto, "getRandomValues").mockImplementation(<T extends ArrayBufferView | null>(array: T) => {
      if (!forced && array instanceof Uint8Array && array.length === 9) {
        forced = true;
        return array.fill(0) as T;
      }
      return real(array as Uint8Array) as T;
    });
    const res = await postPaste(valid());
    expect(res.status).toBe(201);
    const { id } = CreatePasteResponse.parse(await res.json());
    expect(forced).toBe(true);
    expect(id).not.toBe(taken);
    expect(await counter()).toBe(1);
  });

  it("fails with 500 and leaves the counter alone when every id collides", async () => {
    await insertRow("AAAAAAAAAAAA", null);
    const real = crypto.getRandomValues.bind(crypto);
    const spy = vi
      .spyOn(crypto, "getRandomValues")
      .mockImplementation(<T extends ArrayBufferView | null>(array: T) =>
        array instanceof Uint8Array && array.length === 9
          ? (array.fill(0) as T)
          : (real(array as Uint8Array) as T),
      );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await postPaste(valid());
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "internal" });
    expect(spy.mock.calls.filter(([a]) => (a as Uint8Array).length === 9)).toHaveLength(4);
    expect(await counter()).toBe(0);
  });
});

describe("CREATE_MODE", () => {
  const post = (mode: string) =>
    worker.fetch(
      new Request(`${ORIGIN}/api/pastes`, {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": randomIp() },
        body: JSON.stringify(valid()),
      }),
      { ...env, CREATE_MODE: mode },
      createExecutionContext(),
    );

  it.each(["off", "", "bogus"])("answers %j like an unknown route", async (mode) => {
    const unknown = await worker.fetch(new Request(`${ORIGIN}/api/nope`), env, createExecutionContext());
    const res = await post(mode);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(await unknown.json());
    expect(res.headers.get("cache-control")).toBeNull();
    expect(await counter()).toBe(0);
  });

  it("creates when open", async () => {
    expect((await post("open")).status).toBe(201);
  });
});
