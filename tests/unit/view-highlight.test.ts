import { describe, expect, it } from "vitest";
import { highlight } from "../../src/client/lib/highlight";
import { LANGUAGES } from "../../src/client/lib/languages";
import { splitHighlighted } from "../../src/client/lib/view";

const ONLY_HLJS_MARKUP = /<(?!span class="[^"<>]*">|\/span>)/;

describe("highlight", () => {
  it("leaves a line of prose plain instead of guessing a language", () => {
    expect(
      highlight("db password for the staging box: correct-horse-battery-staple", { mode: "auto" }),
    ).toBeNull();
  });

  it("still detects real code", () => {
    const nginx =
      "server {\n    listen 443 ssl;\n    server_name example.com;\n    location / { proxy_pass http://127.0.0.1:8080; }\n}\n";
    expect(highlight(nginx, { mode: "auto" })?.language).toBe("nginx");
  });

  it("highlights in the given language and escapes the source", () => {
    const out = highlight('const x = "<script>alert(1)</script>";', {
      mode: "language",
      language: "javascript",
    });
    expect(out?.language).toBe("javascript");
    expect(out?.html).toContain('<span class="hljs-keyword">const</span>');
    expect(out?.html).toContain("&lt;script&gt;");
    expect(out?.html).not.toMatch(ONLY_HLJS_MARKUP);
  });

  it("auto-detects a recognisable language", () => {
    const code = "def greet(name):\n    return f'hi {name}'\n\nclass A:\n    pass\n";
    expect(highlight(code, { mode: "auto" })?.language).toBe("python");
  });

  it("returns null when auto-detection recognises nothing", () => {
    expect(highlight("", { mode: "auto" })).toBeNull();
  });

  it("registers every LANGUAGES id and no others", () => {
    for (const [id] of LANGUAGES) {
      if (id === "auto") continue;
      expect(highlight("x", { mode: "language", language: id })?.language, id).toBe(id);
    }
    expect(() => highlight("x", { mode: "language", language: "cobol" })).toThrow();
  });

  it("splits multi-line tokens into balanced lines of highlight.js markup only", () => {
    const out = highlight("/* a\n<b> */\nint x;", { mode: "language", language: "c" });
    const lines = splitHighlighted(out!.html);
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line).not.toMatch(ONLY_HLJS_MARKUP);
      expect(line.match(/<span /g)?.length ?? 0).toBe(line.match(/<\/span>/g)?.length ?? 0);
    }
  });
});
