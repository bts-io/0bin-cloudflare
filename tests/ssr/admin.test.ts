import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("admin page", () => {
  it("renders the frame and a loading state only, never admin data", async () => {
    const res = await SELF.fetch("https://example.com/admin");
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(body).toMatch(/<meta name="robots" content="noindex"[ />]/);
    expect(body).toContain("<title>admin · 0bin</title>");
    expect(body).toContain("loading admin");
    expect(body).toMatch(/aria-live="polite"/);
    for (const text of [
      "burn pending",
      "pastes created",
      "load more",
      "purge expired now",
      "delete by url or id",
      "admin token",
      "not an admin",
      "not enabled",
    ]) {
      expect(body).not.toContain(text);
    }
    expect(body).not.toMatch(/<style\b|\sstyle="/);
  });
});
