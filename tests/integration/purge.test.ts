import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { purgeExpired } from "../../src/worker/lib/purge";
import { insertRow, resetDb } from "./helpers";

beforeEach(resetDb);

/** Inserts `n` rows that expired at `expiresAt`, ids `exp000000001`.. (12 chars). */
const insertExpired = (n: number, expiresAt: number) =>
  env.DB.prepare(
    `WITH RECURSIVE seq(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM seq WHERE i < ?1)
     INSERT INTO pastes (id, ciphertext, size, kind, burn, read_token_hash, owner_token_hash, created_at, expires_at)
     SELECT printf('exp%09d', i), 'AQ', 1, 'text', 0, 'x', 'y', 0, ?2 FROM seq`,
  )
    .bind(n, expiresAt)
    .run();

describe("purgeExpired", () => {
  it("deletes more than 500 expired rows and keeps never and future rows", async () => {
    const now = Date.now();
    await insertExpired(1234, now - 1000);
    await insertRow("atTheMoment1", now);
    await insertRow("neverExpire1", null);
    await insertRow("futurePaste1", now + 60_000);
    expect(await purgeExpired(env.DB, now)).toBe(1235);
    const left = await env.DB.prepare("SELECT id FROM pastes ORDER BY id").all<{ id: string }>();
    expect(left.results.map((r) => r.id)).toEqual(["futurePaste1", "neverExpire1"]);
    expect(await purgeExpired(env.DB, now)).toBe(0);
  });
});
