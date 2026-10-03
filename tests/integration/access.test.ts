import { createExecutionContext, env } from "cloudflare:test";
import { SignJWT } from "jose";
import { beforeEach, describe, expect, it } from "vitest";
import { Stats } from "../../src/shared/schemas/stats";
import worker from "../../src/worker/index";
import { AUD, accessVars, KID, now, setupAccessKeys, TEAM } from "./access-keys";
import { blob, counter, ORIGIN, randomIp, resetDb, token } from "./helpers";

const { keys, sign } = setupAccessKeys();
beforeEach(resetDb);

type Vars = { CREATE_MODE: string; ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string; CREATE_TOKEN?: string };

const call = (path: string, vars: Vars, jwt?: string, init: RequestInit = {}) =>
  worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      ...init,
      headers: {
        "cf-connecting-ip": randomIp(),
        ...(jwt && { "cf-access-jwt-assertion": jwt }),
        ...init.headers,
      },
    }),
    { ...env, ...vars },
    createExecutionContext(),
  );

const create = (vars: Vars, jwt?: string) =>
  call("/api/pastes", vars, jwt, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ciphertext: blob(), kind: "text", readToken: token() }),
  });

const expectUnauthorized = async (res: Response) => {
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "unauthorized", message: "Unauthorized" });
};

describe("CREATE_MODE=access on POST /api/pastes", () => {
  it("creates with a valid Access JWT", async () => {
    const res = await create(accessVars, await sign());
    expect(res.status).toBe(201);
    expect(await counter()).toBe(1);
  });

  it("accepts an aud array that contains the application AUD", async () => {
    expect((await create(accessVars, await sign({ aud: ["other-app", AUD] }))).status).toBe(201);
  });

  it("accepts a team domain configured with a trailing slash", async () => {
    expect((await create({ ...accessVars, ACCESS_TEAM_DOMAIN: `${TEAM}/` }, await sign())).status).toBe(201);
  });

  it.each([
    ["a missing token", async () => undefined],
    ["a malformed token", async () => "not.a.jwt"],
    ["an expired token", () => sign({ exp: now() - 120 })],
    ["a token not yet valid", () => sign({ nbf: now() + 120 })],
    [
      "a token without exp",
      () =>
        new SignJWT({})
          .setProtectedHeader({ alg: "RS256", kid: KID })
          .setIssuer(TEAM)
          .setAudience(AUD)
          .sign(keys.signer.privateKey),
    ],
    ["the wrong aud", () => sign({ aud: "other-app" })],
    ["the wrong iss", () => sign({ iss: "https://evil.cloudflareaccess.com" })],
    ["a bad signature", () => sign({}, keys.stranger.privateKey)],
  ])("rejects %s with 401", async (_name, makeToken) => {
    await expectUnauthorized(await create(accessVars, await makeToken()));
    expect(await counter()).toBe(0);
  });

  it.each([
    ["an empty team domain", { ...accessVars, ACCESS_TEAM_DOMAIN: "" }],
    ["an empty AUD", { ...accessVars, ACCESS_AUD: "" }],
    ["both empty", { CREATE_MODE: "access", ACCESS_TEAM_DOMAIN: "", ACCESS_AUD: "" }],
  ])("fails closed with 401 on %s", async (_name, vars) => {
    await expectUnauthorized(await create(vars, await sign()));
    expect(await counter()).toBe(0);
  });

  it("fetches the team JWKS once, not per request", async () => {
    const vars = { ...accessVars, ACCESS_TEAM_DOMAIN: "https://cache-check.cloudflareaccess.com" };
    for (let i = 0; i < 3; i++) {
      const jwt = await sign({ iss: vars.ACCESS_TEAM_DOMAIN });
      expect((await create(vars, jwt)).status).toBe(201);
    }
    const certCalls = keys.fetchSpy.mock.calls.filter(([input]) =>
      String(input instanceof Request ? input.url : input).startsWith(vars.ACCESS_TEAM_DOMAIN),
    );
    expect(certCalls).toHaveLength(1);
  });

  it("still answers off with 404 even with a valid token", async () => {
    const res = await create({ ...accessVars, CREATE_MODE: "off" }, await sign());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found", message: "Not found" });
    expect(await counter()).toBe(0);
  });
});

describe("GET /api/stats", () => {
  const stats = (vars: Vars, jwt?: string) => call("/api/stats", vars, jwt);

  it("answers 404 when off", async () => {
    const res = await stats({ CREATE_MODE: "off" });
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

  it("requires a valid Access JWT when access", async () => {
    await expectUnauthorized(await stats(accessVars));
    await expectUnauthorized(await stats(accessVars, await sign({ aud: "other-app" })));
    await expectUnauthorized(await stats({ ...accessVars, ACCESS_AUD: "" }, await sign()));
    const res = await stats(accessVars, await sign());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(Stats.parse(await res.json())).toEqual({ pastesCreated: 0 });
  });
});

describe("CREATE_MODE=token", () => {
  const CREATE_TOKEN = "create-secret-for-tests";
  const tokenVars = { CREATE_MODE: "token", CREATE_TOKEN };
  const bearer = (value: string) => ({ authorization: `Bearer ${value}` });

  const createWith = (vars: Vars, headers: Record<string, string>) =>
    call("/api/pastes", vars, undefined, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ ciphertext: blob(), kind: "text", readToken: token() }),
    });

  it("creates with the right bearer token", async () => {
    expect((await createWith(tokenVars, bearer(CREATE_TOKEN))).status).toBe(201);
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
    await expectUnauthorized(await createWith(vars, headers));
    expect(await counter()).toBe(0);
  });

  it("ignores an Access JWT", async () => {
    await expectUnauthorized(await create({ ...accessVars, ...tokenVars }, await sign()));
  });

  it("gates GET /api/stats the same way", async () => {
    await expectUnauthorized(await call("/api/stats", tokenVars));
    await expectUnauthorized(await call("/api/stats", tokenVars, undefined, { headers: bearer("wrong") }));
    await expectUnauthorized(
      await call("/api/stats", { CREATE_MODE: "token" }, undefined, { headers: bearer(CREATE_TOKEN) }),
    );
    const res = await call("/api/stats", tokenVars, undefined, { headers: bearer(CREATE_TOKEN) });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(Stats.parse(await res.json())).toEqual({ pastesCreated: 0 });
  });
});
