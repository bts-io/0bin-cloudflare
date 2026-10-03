import { beforeEach, describe, expect, it } from "vitest";
import { PasteMeta, PasteRead } from "../../src/shared/schemas/paste";
import {
  createPaste,
  deletePaste,
  getMeta,
  getPaste,
  insertRow,
  resetDb,
  row,
  sha256Hex,
  token,
} from "./helpers";

beforeEach(resetDb);

const expectNoStore = (res: Response) => {
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("x-robots-tag")).toBe("noindex");
};

const expectNotFound = async (res: Response) => {
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "not_found", message: "Not found" });
};

describe("GET /api/pastes/:id", () => {
  it("reads a non-burn paste any number of times", async () => {
    const p = await createPaste();
    for (let i = 0; i < 2; i++) {
      const res = await getPaste(p.id, { "x-read-token": p.readToken });
      expect(res.status).toBe(200);
      expectNoStore(res);
      const body = PasteRead.parse(await res.json());
      expect(body).toMatchObject({ id: p.id, kind: "text", burn: false, burned: false });
      expect(body.ciphertext).toBe((await row(p.id))!.ciphertext);
    }
  });

  it("burns on the first read and 404s after", async () => {
    const p = await createPaste({ burn: true, expiry: "1w" });
    const first = await getPaste(p.id, { "x-read-token": p.readToken });
    expect(first.status).toBe(200);
    expect(PasteRead.parse(await first.json())).toMatchObject({ burn: true, burned: true });
    await expectNotFound(await getPaste(p.id, { "x-read-token": p.readToken }));
    expect(await row(p.id)).toBeNull();
  });

  it("hands a burn paste to exactly one of 10 concurrent readers", async () => {
    const p = await createPaste({ burn: true });
    const results = await Promise.all(
      Array.from({ length: 10 }, () => getPaste(p.id, { "x-read-token": p.readToken })),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, ...Array(9).fill(404)]);
    await Promise.all(results.map((r) => r.body?.cancel()));
    expect(await row(p.id)).toBeNull();
  });

  it("keeps a burn paste on a wrong or missing read token", async () => {
    const p = await createPaste({ burn: true });
    await expectNotFound(await getPaste(p.id, { "x-read-token": token() }));
    await expectNotFound(await getPaste(p.id, { "x-read-token": "short" }));
    await expectNotFound(await getPaste(p.id));
    expect(await row(p.id)).not.toBeNull();
  });

  it("lets the owner peek at a burn paste without burning it", async () => {
    const p = await createPaste({ burn: true });
    for (let i = 0; i < 2; i++) {
      const res = await getPaste(p.id, { "x-owner-token": p.ownerToken });
      expect(res.status).toBe(200);
      expect(PasteRead.parse(await res.json())).toMatchObject({ id: p.id, burn: true, burned: false });
    }
    await expectNotFound(await getPaste(p.id, { "x-owner-token": token() }));
    expect(await row(p.id)).not.toBeNull();
  });

  it("hides expired rows before any purge", async () => {
    const readToken = token();
    await insertRow("expiredPaste", Date.now() - 1, await sha256Hex(readToken));
    await insertRow("expiredBurn1", Date.now() - 1, await sha256Hex(readToken), 1);
    for (const id of ["expiredPaste", "expiredBurn1"]) {
      await expectNotFound(await getPaste(id, { "x-read-token": readToken }));
      await expectNotFound(await getMeta(id, { "x-read-token": readToken }));
      expect(await row(id)).not.toBeNull();
    }
  });
});

describe("GET /api/pastes/:id/meta", () => {
  it("describes a burn paste and never deletes it", async () => {
    const p = await createPaste({ burn: true, kind: "file" });
    for (let i = 0; i < 3; i++) {
      const res = await getMeta(p.id, { "x-read-token": p.readToken });
      expect(res.status).toBe(200);
      expectNoStore(res);
      expect(PasteMeta.parse(await res.json())).toEqual({
        id: p.id,
        kind: "file",
        size: 1 + 12 + 64,
        burn: true,
        createdAt: p.createdAt,
        expiresAt: p.expiresAt,
      });
    }
    expect(await row(p.id)).not.toBeNull();
  });

  it("404s on a wrong or missing read token", async () => {
    const p = await createPaste();
    await expectNotFound(await getMeta(p.id, { "x-read-token": token() }));
    await expectNotFound(await getMeta(p.id));
    await expectNotFound(await getMeta("unknownPaste", { "x-read-token": p.readToken }));
  });
});

describe("DELETE /api/pastes/:id", () => {
  it("deletes with the owner token", async () => {
    const p = await createPaste();
    const res = await deletePaste(p.id, { "x-owner-token": p.ownerToken });
    expect(res.status).toBe(204);
    expectNoStore(res);
    await expectNotFound(await getPaste(p.id, { "x-read-token": p.readToken }));
    await expectNotFound(await deletePaste(p.id, { "x-owner-token": p.ownerToken }));
  });

  it("404s on a wrong owner token and keeps the row", async () => {
    const p = await createPaste();
    await expectNotFound(await deletePaste(p.id, { "x-owner-token": token() }));
    await expectNotFound(await deletePaste(p.id, { "x-owner-token": p.readToken }));
    expect(await row(p.id)).not.toBeNull();
  });

  it("400s on a missing or malformed owner token", async () => {
    const p = await createPaste();
    for (const headers of [{}, { "x-owner-token": "short" }]) {
      const res = await deletePaste(p.id, headers);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "invalid_request" });
    }
    expect(await row(p.id)).not.toBeNull();
  });
});

describe("bad id format", () => {
  it.each(["short", "waytoolongid1234", "abcdefghijk.", "abc%20efghijk"])("404s on %j", async (id) => {
    const headers = { "x-read-token": token(), "x-owner-token": token() };
    for (const res of [
      await getPaste(id, headers),
      await getMeta(id, headers),
      await deletePaste(id, headers),
    ]) {
      await expectNotFound(res);
      expectNoStore(res);
    }
  });
});
