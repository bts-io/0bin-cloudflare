import { createExecutionContext, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { AdminPasteList, AdminPurgeResult, AdminStats } from "../../src/shared/schemas/admin";
import worker from "../../src/worker/index";
import { accessVars, setupAccessKeys } from "./access-keys";
import { counter, createPaste, ORIGIN, resetDb, row } from "./helpers";

const { sign } = setupAccessKeys();
beforeEach(resetDb);

const ADMIN_TOKEN = "admin-secret-for-tests";
type Vars = Record<string, string | undefined>;
const tokenVars: Vars = { CREATE_MODE: "open", ADMIN_TOKEN };
const auth = { authorization: `Bearer ${ADMIN_TOKEN}` };

const call = (path: string, vars: Vars, headers: Record<string, string> = {}, method = "GET") =>
  worker.fetch(
    new Request(`${ORIGIN}/api/admin${path}`, { method, headers }),
    { ...env, ...vars },
    createExecutionContext(),
  );

const unknownRoute = async () =>
  (await worker.fetch(new Request(`${ORIGIN}/api/nope`), env, createExecutionContext())).json();

/** Inserts a row with controlled timestamps, size and burn; ciphertext and hashes are recognisable markers. */
const insert = (id: string, createdAt: number, expiresAt: number | null, size = 10, burn = 0) =>
  env.DB.prepare(
    `INSERT INTO pastes (id, ciphertext, size, kind, burn, read_token_hash, owner_token_hash, created_at, expires_at)
     VALUES (?, 'CIPHERTEXT', ?, 'text', ?, 'READHASH', 'OWNERHASH', ?, ?)`,
  )
    .bind(id, size, burn, createdAt, expiresAt)
    .run();

const ids = (list: AdminPasteList) => list.items.map((i) => i.id);

describe("admin auth", () => {
  const routes: [string, string][] = [
    ["GET", "/pastes"],
    ["GET", "/stats"],
    ["POST", "/purge"],
    ["DELETE", "/pastes/abcdefghijkl"],
  ];

  it.each([
    ["no ADMIN_TOKEN", { CREATE_MODE: "open" }],
    ["an empty ADMIN_TOKEN", { CREATE_MODE: "open", ADMIN_TOKEN: "" }],
    ["off mode", { CREATE_MODE: "off" }],
    ["token mode", { CREATE_MODE: "token", CREATE_TOKEN: "c" }],
  ])("answers 404 like an unknown route with %s", async (_name, vars) => {
    const expected = await unknownRoute();
    for (const [method, path] of routes) {
      const res = await call(path, vars, auth, method);
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBeNull();
      expect(await res.json()).toEqual(expected);
    }
  });

  describe("token (any mode but access)", () => {
    it.each([
      ["no header", {}],
      ["a wrong token", { authorization: "Bearer nope" }],
      ["a longer token", { authorization: `Bearer ${ADMIN_TOKEN}x` }],
      ["another scheme", { authorization: `Basic ${ADMIN_TOKEN}` }],
    ])("answers 401 for %s", async (_name, headers) => {
      for (const [method, path] of routes) {
        const res = await call(path, tokenVars, headers, method);
        expect(res.status).toBe(401);
        expect(res.headers.get("cache-control")).toBe("no-store");
        expect(await res.json()).toEqual({ error: "unauthorized", message: "Unauthorized" });
      }
    });

    it.each(["open", "off", "token", "bogus"])(
      "answers 200 with the right token in %s mode",
      async (mode) => {
        const res = await call("/stats", { CREATE_MODE: mode, ADMIN_TOKEN }, auth);
        expect(res.status).toBe(200);
        expect(res.headers.get("cache-control")).toBe("no-store");
      },
    );

    it("does not accept CREATE_TOKEN as an admin token", async () => {
      const vars = { CREATE_MODE: "token", CREATE_TOKEN: "create-only", ADMIN_TOKEN };
      expect((await call("/stats", vars, { authorization: "Bearer create-only" })).status).toBe(401);
    });
  });

  describe("access mode", () => {
    const jwt = async (claims = {}) => ({ "cf-access-jwt-assertion": await sign(claims) });

    it("answers 401 without a valid JWT, even with ADMIN_TOKEN", async () => {
      expect((await call("/stats", { ...accessVars, ADMIN_TOKEN }, auth)).status).toBe(401);
      expect((await call("/stats", accessVars, await jwt({ aud: "other-app" }))).status).toBe(401);
      expect((await call("/stats", { ...accessVars, ACCESS_AUD: "" }, await jwt())).status).toBe(401);
    });

    it("answers 403 when the email is not in ADMIN_EMAILS", async () => {
      const vars = { ...accessVars, ADMIN_EMAILS: "boss@example.com, ops@example.com" };
      for (const [method, path] of routes) {
        const res = await call(path, vars, await jwt({ email: "someone@example.com" }), method);
        expect(res.status).toBe(403);
        expect(res.headers.get("cache-control")).toBe("no-store");
        expect(await res.json()).toEqual({ error: "forbidden", message: "Forbidden" });
      }
      expect((await call("/stats", vars, await jwt({ email: undefined }))).status).toBe(403);
    });

    it("answers 200 when the email is listed, ignoring case and spaces", async () => {
      const vars = { ...accessVars, ADMIN_EMAILS: " Boss@Example.com ,ops@example.com" };
      expect((await call("/stats", vars, await jwt({ email: "boss@example.COM" }))).status).toBe(200);
      expect((await call("/stats", vars, await jwt({ email: "ops@example.com" }))).status).toBe(200);
    });

    it("answers 200 for any authenticated user when ADMIN_EMAILS is empty", async () => {
      expect((await call("/stats", { ...accessVars, ADMIN_EMAILS: "" }, await jwt())).status).toBe(200);
      expect((await call("/stats", { ...accessVars, ADMIN_EMAILS: " , " }, await jwt())).status).toBe(200);
    });
  });
});

describe("GET /api/admin/pastes", () => {
  const list = async (query = "") => {
    const res = await call(`/pastes${query}`, tokenVars, auth);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    return AdminPasteList.parse(await res.json());
  };

  it("pages active pastes newest first with a cursor, breaking createdAt ties by id", async () => {
    const future = Date.now() + 3_600_000;
    // Five active rows; two share createdAt 3000.
    await insert("aaaaaaaaaaa1", 1000, null);
    await insert("aaaaaaaaaaa2", 2000, future);
    await insert("aaaaaaaaaaa3", 3000, null);
    await insert("aaaaaaaaaaa4", 3000, future);
    await insert("aaaaaaaaaaa5", 4000, null);
    await insert("expiredpast1", 5000, 6000);

    const first = await list("?limit=2");
    expect(ids(first)).toEqual(["aaaaaaaaaaa5", "aaaaaaaaaaa4"]);
    expect(first.nextCursor).toBe("3000:aaaaaaaaaaa4");

    const second = await list(`?limit=2&cursor=${first.nextCursor}`);
    expect(ids(second)).toEqual(["aaaaaaaaaaa3", "aaaaaaaaaaa2"]);

    const third = await list(`?limit=2&cursor=${second.nextCursor}`);
    expect(ids(third)).toEqual(["aaaaaaaaaaa1"]);
    expect(third.nextCursor).toBeNull();

    const all = await list();
    expect(ids(all)).toHaveLength(5);
    expect(all.nextCursor).toBeNull();
  });

  it("returns a null cursor when the last page is exactly full", async () => {
    await insert("aaaaaaaaaaa1", 1000, null);
    await insert("aaaaaaaaaaa2", 2000, null);
    expect((await list("?limit=2")).nextCursor).toBeNull();
  });

  it("filters expired pastes with state=expired", async () => {
    const now = Date.now();
    await insert("activeNever1", 1000, null);
    await insert("activeLater1", 2000, now + 60_000);
    await insert("expiredOld01", 3000, now - 60_000);
    await insert("expiredOld02", 4000, now - 1);
    expect(ids(await list("?state=expired"))).toEqual(["expiredOld02", "expiredOld01"]);
    expect(ids(await list("?state=active"))).toEqual(["activeLater1", "activeNever1"]);
  });

  it("lists metadata only, never ciphertext or token hashes", async () => {
    await insert("aaaaaaaaaaa1", 1000, 9_999_999_999_999, 42, 1);
    const created = await createPaste();
    const res = await call("/pastes", tokenVars, auth);
    const text = await res.text();
    for (const secret of ["CIPHERTEXT", "READHASH", "OWNERHASH", created.ownerToken, created.readToken])
      expect(text).not.toContain(secret);
    expect(text).not.toContain((await row(created.id))!.ciphertext);
    const body = AdminPasteList.parse(JSON.parse(text));
    for (const item of body.items)
      expect(Object.keys(item).sort()).toEqual(["burn", "createdAt", "expiresAt", "id", "kind", "size"]);
    expect(body.items.find((i) => i.id === "aaaaaaaaaaa1")).toEqual({
      id: "aaaaaaaaaaa1",
      kind: "text",
      size: 42,
      burn: true,
      createdAt: 1000,
      expiresAt: 9_999_999_999_999,
    });
  });

  it.each(["?limit=0", "?limit=101", "?limit=abc", "?state=all", "?cursor=nope", "?cursor=1000:short"])(
    "answers 400 for %s",
    async (query) => {
      const res = await call(`/pastes${query}`, tokenVars, auth);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "invalid_request" });
    },
  );
});

describe("DELETE /api/admin/pastes/:id", () => {
  it("deletes any paste with 204, then 404", async () => {
    const { id } = await createPaste({ burn: true, expiry: "1h" });
    const first = await call(`/pastes/${id}`, tokenVars, auth, "DELETE");
    expect(first.status).toBe(204);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(await row(id)).toBeNull();
    const again = await call(`/pastes/${id}`, tokenVars, auth, "DELETE");
    expect(again.status).toBe(404);
    expect(await again.json()).toEqual({ error: "not_found", message: "Not found" });
  });

  it("answers 404 for a malformed id", async () => {
    expect((await call("/pastes/bad", tokenVars, auth, "DELETE")).status).toBe(404);
  });
});

describe("GET /api/admin/stats", () => {
  it("counts active rows, pending burns, active bytes and the all-time counter", async () => {
    const now = Date.now();
    await createPaste();
    await createPaste({ burn: true, expiry: "1w" });
    await insert("activeNever1", 1000, null, 100);
    await insert("activeBurn01", 2000, now + 60_000, 200, 1);
    await insert("expiredOld01", 3000, now - 60_000, 400, 1);
    const res = await call("/stats", tokenVars, auth);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(AdminStats.parse(await res.json())).toEqual({
      active: 4,
      burnPending: 2,
      totalBytes: 2 * (1 + 12 + 64) + 100 + 200,
      pastesCreated: 2,
    });
  });

  it("answers zeros on an empty database", async () => {
    const res = await call("/stats", tokenVars, auth);
    expect(AdminStats.parse(await res.json())).toEqual({
      active: 0,
      burnPending: 0,
      totalBytes: 0,
      pastesCreated: 0,
    });
  });
});

describe("POST /api/admin/purge", () => {
  it("deletes expired rows now and returns the count", async () => {
    const now = Date.now();
    await insert("activeNever1", 1000, null);
    await insert("activeLater1", 2000, now + 60_000);
    await insert("expiredOld01", 3000, now - 60_000);
    await insert("expiredOld02", 4000, now - 1);
    const res = await call("/purge", tokenVars, auth, "POST");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(AdminPurgeResult.parse(await res.json())).toEqual({ deleted: 2 });
    const left = await env.DB.prepare("SELECT id FROM pastes ORDER BY id").all<{ id: string }>();
    expect(left.results.map((r) => r.id)).toEqual(["activeLater1", "activeNever1"]);
    expect(await counter()).toBe(0);
    expect(AdminPurgeResult.parse(await (await call("/purge", tokenVars, auth, "POST")).json())).toEqual({
      deleted: 0,
    });
  });

  it("is POST only", async () => {
    expect((await call("/purge", tokenVars, auth)).status).toBe(404);
  });
});
