import { createExecutionContext, env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../../src/worker/index";
import { ORIGIN } from "./helpers";

describe("api", () => {
  it("reports health with a live D1 check", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ ok: true, db: "ok" });
  });

  it("answers 503 when D1 fails", async () => {
    const broken = {
      prepare() {
        throw new Error("d1 down");
      },
    } as unknown as D1Database;
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/health`),
      { ...env, DB: broken },
      createExecutionContext(),
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, db: "error" });
  });

  it("answers unknown API paths with a JSON 404", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/x`);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "not_found" });
  });

  it("runs against a migrated D1 with the counter seeded and meta gone", async () => {
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('meta', 'pastes', 'counters') ORDER BY name",
    ).all<{ name: string }>();
    expect(tables.results.map((t) => t.name)).toEqual(["counters", "pastes"]);
    const seed = await env.DB.prepare("SELECT name FROM counters").all<{ name: string }>();
    expect(seed.results.map((r) => r.name)).toEqual(["pastes_created"]);
  });
});
