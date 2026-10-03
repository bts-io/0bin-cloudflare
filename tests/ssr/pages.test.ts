import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE_HEADERS = {
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

const nonceOf = (res: Response) =>
  res.headers.get("content-security-policy")?.match(/script-src 'self' 'nonce-([A-Za-z0-9+/=]+)'/)?.[1];

describe("server-rendered pages", () => {
  it("renders the home document with the stylesheet", async () => {
    const res = await SELF.fetch("https://example.com/");
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("<title>0bin</title>");
    expect(body).toContain("client-side encrypted pastebin · key lives in the link");
    expect(body).toMatch(/<link rel="stylesheet" href="\/assets\/[^"]+\.css"/);
  });

  it("sends a strict CSP whose nonce is on every script", async () => {
    const res = await SELF.fetch("https://example.com/");
    const body = await res.text();
    const csp = res.headers.get("content-security-policy");
    expect(csp).toBe(
      `default-src 'self'; script-src 'self' 'nonce-${nonceOf(res)}' https://challenges.cloudflare.com; ` +
        "frame-src https://challenges.cloudflare.com; style-src 'self'; img-src 'self' blob: data:; " +
        "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
    );
    const nonce = nonceOf(res)!;
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    for (const [name, value] of Object.entries(BASE_HEADERS)) expect(res.headers.get(name)).toBe(value);

    const scripts = [...body.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    const inline = scripts.filter(([, attrs, content]) => !/\bsrc=/.test(attrs) && content.trim());
    expect(inline.length).toBeGreaterThan(0);
    for (const [tag, attrs] of scripts) expect(attrs, tag.slice(0, 80)).toContain(`nonce="${nonce}"`);
    expect(body).not.toMatch(/<style\b|\sstyle="/);
  });

  it("uses a fresh nonce per request", async () => {
    const [a, b] = await Promise.all([
      SELF.fetch("https://example.com/"),
      SELF.fetch("https://example.com/"),
    ]);
    await Promise.all([a.text(), b.text()]);
    expect(nonceOf(a)).toBeTruthy();
    expect(nonceOf(a)).not.toBe(nonceOf(b));
  });

  it("routes /api through the same Worker with the security headers and no CSP", async () => {
    for (const path of ["/api/health", "/api/nope"]) {
      const res = await SELF.fetch(`https://example.com${path}`);
      for (const [name, value] of Object.entries(BASE_HEADERS)) expect(res.headers.get(name)).toBe(value);
      expect(res.headers.get("content-security-policy")).toBeNull();
      if (path === "/api/health") expect(await res.json()).toEqual({ ok: true, db: "ok" });
      else expect(res.status).toBe(404);
    }
  });
});

describe("Turnstile CSP", () => {
  const TURNSTILE = "https://challenges.cloudflare.com";
  const directive = (csp: string, name: string) =>
    csp
      .split("; ")
      .find((d) => d.startsWith(`${name} `))
      ?.split(" ")
      .slice(1);

  it("lets the create page load the Turnstile script and frame", async () => {
    const res = await SELF.fetch("https://example.com/");
    await res.text();
    const csp = res.headers.get("content-security-policy")!;
    expect(directive(csp, "script-src")).toEqual(["'self'", `'nonce-${nonceOf(res)}'`, TURNSTILE]);
    expect(directive(csp, "frame-src")).toEqual([TURNSTILE]);
  });

  it("keeps it off every other page", async () => {
    for (const path of ["/p/AAAAAAAAAAAA", "/admin"]) {
      const res = await SELF.fetch(`https://example.com${path}`);
      await res.text();
      const csp = res.headers.get("content-security-policy")!;
      expect(csp, path).toBe(
        `default-src 'self'; script-src 'self' 'nonce-${nonceOf(res)}'; style-src 'self'; ` +
          "img-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; " +
          "form-action 'self'; object-src 'none'",
      );
      expect(csp, path).not.toContain(TURNSTILE);
    }
  });
});
