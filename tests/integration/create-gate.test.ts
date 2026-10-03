import { createExecutionContext, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { Stats } from "../../src/shared/schemas/stats";
import worker from "../../src/worker/index";
import { blob, counter, ORIGIN, randomIp, resetDb, token } from "./helpers";

beforeEach(resetDb);

type Vars = { CREATE_MODE: string; CREATE_TOKEN?: string };

const call = (path: string, vars: Vars, init: RequestInit = {}) =>
  worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      ...init,
      headers: { "cf-connecting-ip": randomIp(), ...init.headers },
    }),
    { ...env, ...vars },
    createExecutionContext(),
  );

const create = (vars: Vars, headers: Record<string, string> = {}) =>
  call("/api/pastes", vars, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ ciphertext: blob(), kind: "text", readToken: token() }),
  });

const expectUnauthorized = async (res: Response) => {
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "unauthorized", message: "Unauthorized" });
};

describe("GET /api/stats", () => {
  const stats = (vars: Vars) => call("/api/stats", vars);

  it.each(["off", "", "bogus"])("answers 404 when CREATE_MODE is %j", async (mode) => {
    const res = await stats({ CREATE_MODE: mode });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found", message: "Not found" });
  });

  it("is public and uncached when open", async () => {
    for (let i = 0; i < 2; i++) expect((await create({ CREATE_MODE: "open" })).status).toBe(201);
    const res = await stats({ CREATE_MODE: "open" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(Stats.parse(await res.json())).toEqual({ pastesCreated: 2 });
  });
});

describe("CREATE_MODE=token", () => {
  const CREATE_TOKEN = "create-secret-for-tests";
  const tokenVars = { CREATE_MODE: "token", CREATE_TOKEN };
  const bearer = (value: string) => ({ authorization: `Bearer ${value}` });

  it("creates with the right bearer token", async () => {
    expect((await create(tokenVars, bearer(CREATE_TOKEN))).status).toBe(201);
    expect(await counter()).toBe(1);
  });

  it.each([
    ["no Authorization header", tokenVars, {}],
    ["a wrong token", tokenVars, bearer("not-the-token")],
    ["a token that only shares a prefix", tokenVars, bearer(`${CREATE_TOKEN}x`)],
    ["a non-Bearer scheme", tokenVars, { authorization: `Basic ${CREATE_TOKEN}` }],
    ["CREATE_TOKEN unset", { CREATE_MODE: "token" }, bearer(CREATE_TOKEN)],
    ["CREATE_TOKEN empty", { CREATE_MODE: "token", CREATE_TOKEN: "" }, bearer("")],
  ])("rejects %s with 401", async (_name, vars, headers) => {
    await expectUnauthorized(await create(vars, headers));
    expect(await counter()).toBe(0);
  });

  it("still answers off with 404 even with the right token", async () => {
    const res = await create({ CREATE_MODE: "off", CREATE_TOKEN }, bearer(CREATE_TOKEN));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found", message: "Not found" });
    expect(await counter()).toBe(0);
  });

  it("gates GET /api/stats the same way", async () => {
    await expectUnauthorized(await call("/api/stats", tokenVars));
    await expectUnauthorized(await call("/api/stats", tokenVars, { headers: bearer("wrong") }));
    await expectUnauthorized(
      await call("/api/stats", { CREATE_MODE: "token" }, { headers: bearer(CREATE_TOKEN) }),
    );
    const res = await call("/api/stats", tokenVars, { headers: bearer(CREATE_TOKEN) });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(Stats.parse(await res.json())).toEqual({ pastesCreated: 0 });
  });
});
