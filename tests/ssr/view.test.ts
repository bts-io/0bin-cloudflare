import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const NOT_FOUND = "this paste does not exist, has expired, or has already been read.";

describe("view and not-found pages", () => {
  it("renders /p/:id as a neutral loading shell, never paste content", async () => {
    const res = await SELF.fetch("https://example.com/p/abcdefghijkl");
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("loading paste");
    expect(body).toMatch(/<meta name="robots" content="noindex"[ />]/);
    expect(body).toMatch(/<link rel="stylesheet" href="\/assets\/view[^"]*\.css"/);
    for (const text of [NOT_FOUND, "missing its key", "wrong or damaged key", "code-line", "burned:"]) {
      expect(body).not.toContain(text);
    }
    expect(body).not.toMatch(/<style\b|\sstyle="/);
  });

  it("serves unknown routes the not-found page with HTTP 404", async () => {
    const res = await SELF.fetch("https://example.com/nope");
    const body = await res.text();
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(body).toContain(NOT_FOUND);
    expect(body).not.toContain("loading paste");
  });
});
