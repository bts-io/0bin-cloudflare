import { createExecutionContext, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../../src/worker/index";
import { blob, counter, ORIGIN, postPaste, randomIp, resetDb, token } from "./helpers";

beforeEach(resetDb);

const valid = () => ({ ciphertext: blob(), kind: "text", readToken: token() });

/**
 * The local limiter counts in wall-clock aligned 60 s windows, so a burst that straddles a boundary starts
 * over. `burst` gets a fresh key per attempt and is retried once when the window rolled over mid-burst.
 */
async function inOneWindow<T>(burst: () => Promise<T>): Promise<T> {
  const window = () => Math.floor(Date.now() / 60_000);
  for (let attempt = 0; ; attempt++) {
    const start = window();
    const result = await burst();
    if (window() === start || attempt === 1) return result;
  }
}

const expectRateLimited = async (res: Response) => {
  expect(res.status).toBe(429);
  expect(res.headers.get("retry-after")).toBe("60");
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(await res.json()).toMatchObject({ error: "rate_limited" });
};

describe("CREATE_LIMITER (local simulator, 10 per 60 s)", () => {
  it("refuses the 11th create from one IP with 429 and Retry-After, other IPs unaffected", async () => {
    const statuses = await inOneWindow(async () => {
      await resetDb();
      const ip = randomIp();
      const out: number[] = [];
      for (let i = 0; i < 10; i++) out.push((await postPaste(valid(), "application/json", ip)).status);
      const refused = await postPaste(valid(), "application/json", ip);
      out.push(refused.status);
      if (refused.status === 429) await expectRateLimited(refused);
      return out;
    });
    expect(statuses).toEqual([...Array(10).fill(201), 429]);
    expect(await counter()).toBe(10);
    expect((await postPaste(valid())).status).toBe(201);
  });
});

describe("limiter key and placement (recording limiter)", () => {
  /** Stands in for the binding: records every key and answers `success`. */
  const recorder = (success: boolean) => {
    const keys: string[] = [];
    const limiter: RateLimit = {
      limit: async ({ key }) => {
        keys.push(key);
        return { success };
      },
    };
    return { keys, limiter };
  };

  const post = (vars: Record<string, unknown>, headers: Record<string, string>, body: unknown = valid()) =>
    worker.fetch(
      new Request(`${ORIGIN}/api/pastes`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      }),
      { ...env, ...vars },
      createExecutionContext(),
    );

  it("uses create:ip:<CF-Connecting-IP> when open", async () => {
    const { keys, limiter } = recorder(true);
    const res = await post(
      { CREATE_MODE: "open", CREATE_LIMITER: limiter },
      { "cf-connecting-ip": "203.0.113.7" },
    );
    expect(res.status).toBe(201);
    expect(keys).toEqual(["create:ip:203.0.113.7"]);
  });

  it("uses create:ip:<CF-Connecting-IP> in token mode", async () => {
    const { keys, limiter } = recorder(true);
    const res = await post(
      { CREATE_MODE: "token", CREATE_TOKEN: "t0ken", CREATE_LIMITER: limiter },
      { "cf-connecting-ip": "198.51.100.9", authorization: "Bearer t0ken" },
    );
    expect(res.status).toBe(201);
    expect(keys).toEqual(["create:ip:198.51.100.9"]);
  });

  it("runs after the gate: a rejected request is not counted", async () => {
    const { keys, limiter } = recorder(true);
    expect(
      (await post({ CREATE_MODE: "token", CREATE_TOKEN: "t0ken", CREATE_LIMITER: limiter }, {})).status,
    ).toBe(401);
    expect((await post({ CREATE_MODE: "off", CREATE_LIMITER: limiter }, {})).status).toBe(404);
    expect(keys).toEqual([]);
  });

  it("runs before validation: a refused invalid body gets 429, not 400", async () => {
    const { keys, limiter } = recorder(false);
    const res = await post(
      { CREATE_MODE: "open", CREATE_LIMITER: limiter },
      { "cf-connecting-ip": "203.0.113.7" },
      { nope: true },
    );
    await expectRateLimited(res);
    expect(keys).toHaveLength(1);
    expect(await counter()).toBe(0);
  });

  it("does not limit reads or stats", async () => {
    const { keys, limiter } = recorder(false);
    const stats = await worker.fetch(
      new Request(`${ORIGIN}/api/stats`),
      { ...env, CREATE_MODE: "open", CREATE_LIMITER: limiter },
      createExecutionContext(),
    );
    expect(stats.status).toBe(200);
    expect(keys).toEqual([]);
  });
});
