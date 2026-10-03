import { createExecutionContext, env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicConfig } from "../../src/shared/schemas/config";
import worker from "../../src/worker/index";
import { blob, counter, ORIGIN, resetDb, token } from "./helpers";

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const SECRET = "test-secret";

const valid = () => ({ ciphertext: blob(), kind: "text", readToken: token() });

const post = (vars: Record<string, unknown>, headers: Record<string, string> = {}, body: unknown = valid()) =>
  worker.fetch(
    new Request(`${ORIGIN}/api/pastes`, {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7", ...headers },
      body: JSON.stringify(body),
    }),
    { ...env, CREATE_MODE: "open", ...vars },
    createExecutionContext(),
  );

/** Replaces the network with a siteverify stand-in; records what the Worker sent. */
const stubSiteverify = (answer: () => Promise<Response>) => {
  const calls: { url: string; form: FormData }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push({ url, form: init?.body as FormData });
    return answer();
  });
  return calls;
};

const verdict = (success: boolean) => () => Promise.resolve(Response.json({ success }));

const expectRefused = async (res: Response) => {
  expect(res.status).toBe(403);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(await res.json()).toMatchObject({ error: "turnstile_failed" });
  expect(await counter()).toBe(0);
};

describe("Turnstile on create", () => {
  it("is off without the secret: create works without a token and never calls siteverify", async () => {
    const calls = stubSiteverify(verdict(false));
    expect((await post({})).status).toBe(201);
    expect((await post({ TURNSTILE_SECRET_KEY: "" })).status).toBe(201);
    expect(calls).toEqual([]);
  });

  it("creates with a token siteverify accepts, sending the secret, token and client IP", async () => {
    const calls = stubSiteverify(verdict(true));
    const res = await post({ TURNSTILE_SECRET_KEY: SECRET }, { "x-turnstile-token": "tok-1" });
    expect(res.status).toBe(201);
    expect(await counter()).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(SITEVERIFY);
    expect(calls[0]!.form.get("secret")).toBe(SECRET);
    expect(calls[0]!.form.get("response")).toBe("tok-1");
    expect(calls[0]!.form.get("remoteip")).toBe("203.0.113.7");
  });

  it("refuses a missing token with 403 without calling siteverify", async () => {
    const calls = stubSiteverify(verdict(true));
    await expectRefused(await post({ TURNSTILE_SECRET_KEY: SECRET }));
    expect(calls).toEqual([]);
  });

  it("refuses an oversized token with 403 without calling siteverify", async () => {
    const calls = stubSiteverify(verdict(true));
    await expectRefused(
      await post({ TURNSTILE_SECRET_KEY: SECRET }, { "x-turnstile-token": "a".repeat(2049) }),
    );
    expect(calls).toEqual([]);
  });

  it("refuses a token siteverify rejects with 403", async () => {
    stubSiteverify(verdict(false));
    await expectRefused(await post({ TURNSTILE_SECRET_KEY: SECRET }, { "x-turnstile-token": "bad" }));
  });

  it.each([
    ["unreachable", () => Promise.reject(new TypeError("network down"))],
    ["answering 500", () => Promise.resolve(new Response("oops", { status: 500 }))],
    ["answering non-JSON", () => Promise.resolve(new Response("<html>"))],
  ])("fails closed with siteverify %s", async (_name, answer) => {
    stubSiteverify(answer);
    await expectRefused(await post({ TURNSTILE_SECRET_KEY: SECRET }, { "x-turnstile-token": "tok" }));
  });

  it("runs after the rate limit: a limited client gets 429 and siteverify is never called", async () => {
    const calls = stubSiteverify(verdict(true));
    const limiter: RateLimit = { limit: async () => ({ success: false }) };
    const res = await post({ TURNSTILE_SECRET_KEY: SECRET, CREATE_LIMITER: limiter });
    expect(res.status).toBe(429);
    expect(calls).toEqual([]);
  });

  it("runs after the create gate: a disabled create is still a 404", async () => {
    const calls = stubSiteverify(verdict(true));
    expect((await post({ CREATE_MODE: "off", TURNSTILE_SECRET_KEY: SECRET })).status).toBe(404);
    expect(calls).toEqual([]);
  });

  it("runs before body validation: an invalid body without a token gets 403, not 400", async () => {
    stubSiteverify(verdict(true));
    await expectRefused(await post({ TURNSTILE_SECRET_KEY: SECRET }, {}, { nope: true }));
  });
});

describe("GET /api/config", () => {
  const getConfig = (vars: Record<string, unknown>) =>
    worker.fetch(new Request(`${ORIGIN}/api/config`), { ...env, ...vars }, createExecutionContext());

  it("returns a null site key when TURNSTILE_SITE_KEY is empty", async () => {
    const res = await getConfig({ TURNSTILE_SITE_KEY: "" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(PublicConfig.parse(await res.json())).toEqual({ turnstileSiteKey: null });
  });

  it("returns the site key when set", async () => {
    const res = await getConfig({ TURNSTILE_SITE_KEY: "0x4AAAAAAAtest" });
    expect(PublicConfig.parse(await res.json())).toEqual({ turnstileSiteKey: "0x4AAAAAAAtest" });
  });

  it.each(["off", "open", "token"])("is public with CREATE_MODE=%s", async (mode) => {
    const res = await getConfig({ CREATE_MODE: mode, TURNSTILE_SITE_KEY: "0x4AAAAAAAtest" });
    expect(res.status).toBe(200);
  });
});
