import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("create page", () => {
  it("server-renders the form controls without inline styles", async () => {
    const res = await SELF.fetch("https://example.com/");
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toMatch(/<textarea\b[^>]*placeholder="paste text/);
    const title = body.match(/<input\b[^>]*placeholder="title \(optional, encrypted\)"[^>]*>/)?.[0];
    expect(title).toMatch(/maxLength="100"/i);
    expect(body).toMatch(/<select\b[^>]*>(?:(?!<\/select>)[\s\S])*<option value="1d"[^>]*>1 day<\/option>/);
    expect(body).toMatch(/<option value="never"[^>]*>never<\/option>/);
    expect(body).toMatch(/<input\b[^>]*type="checkbox"/);
    expect(body).toContain("burn after reading");
    expect(body).toMatch(/<button\b[^>]*type="submit"[^>]*>encrypt \+ share<\/button>/);
    expect(body).toMatch(/<input\b[^>]*type="file"/);
    expect(body).toMatch(/my pastes \[(?:<!-- -->)?0(?:<!-- -->)?\]/);
    expect(body).toContain("max 1 MiB after compression · text, images, any file");
    expect(body).toMatch(/role="alert"/);
    expect(body).not.toMatch(/<style\b|\sstyle="/);
  });
});
