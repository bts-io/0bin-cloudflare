import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/client/lib/api";
import {
  AUTO_SAMPLE_CHARS,
  canPreview,
  countLines,
  displayText,
  expiryText,
  HIGHLIGHT_MAX_BYTES,
  highlightPlan,
  isPasteId,
  languageLabel,
  linesLabel,
  parseKey,
  splitHighlighted,
  splitLines,
  viewFailure,
} from "../../src/client/lib/view";
import { generateIkm, PasteCryptoError } from "../../src/shared/crypto";

describe("parseKey", () => {
  it("accepts a real 43-char key with or without the leading #", () => {
    const ikm = generateIkm();
    expect(parseKey(`#${ikm}`)).toBe(ikm);
    expect(parseKey(ikm)).toBe(ikm);
  });

  it("rejects a missing, truncated, padded or foreign-alphabet key", () => {
    const ikm = generateIkm();
    for (const hash of [
      "",
      "#",
      `#${ikm.slice(0, 42)}`,
      `#${ikm}A`,
      `#${ikm.slice(0, 42)}=`,
      `#${"+".repeat(43)}`,
    ]) {
      expect(parseKey(hash), hash).toBeNull();
    }
  });
});

describe("isPasteId", () => {
  it("accepts 12 base64url chars only", () => {
    expect(isPasteId("abcdefghijkl")).toBe(true);
    expect(isPasteId("abc")).toBe(false);
    expect(isPasteId("abcdefghijk!")).toBe(false);
  });
});

describe("expiryText", () => {
  const now = 1_000_000_000_000;
  it("says never for a null expiry", () => expect(expiryText(null, now)).toBe("never expires"));
  it("counts minutes, hours and days, rounding down", () => {
    expect(expiryText(now + 30_000, now)).toBe("expires in under a minute");
    expect(expiryText(now + 5 * 60_000, now)).toBe("expires in 5m");
    expect(expiryText(now + 3 * 3_600_000 + 59 * 60_000, now)).toBe("expires in 3h");
    expect(expiryText(now + 47 * 3_600_000, now)).toBe("expires in 47h");
    expect(expiryText(now + 7 * 86_400_000, now)).toBe("expires in 7d");
  });
  it("does not go negative for a paste just past its time", () => {
    expect(expiryText(now - 60_000, now)).toBe("expires in under a minute");
  });
});

describe("canPreview", () => {
  it("previews only the raster image whitelist", () => {
    for (const mime of ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]) {
      expect(canPreview(mime), mime).toBe(true);
    }
  });
  it("never previews SVG, HTML, other types or a missing type", () => {
    for (const mime of [
      "image/svg+xml",
      "text/html",
      "application/pdf",
      "IMAGE/PNG",
      "image/png; x=1",
      undefined,
    ]) {
      expect(canPreview(mime), String(mime)).toBe(false);
    }
  });
});

describe("line counting", () => {
  it("does not count a final newline as an extra line", () => {
    expect(countLines("a\nb\n")).toBe(2);
    expect(countLines("a\nb")).toBe(2);
    expect(linesLabel(1)).toBe("1 line");
    expect(linesLabel(2)).toBe("2 lines");
    expect(countLines("a\n\n")).toBe(2);
    expect(countLines("one")).toBe(1);
    expect(countLines("")).toBe(0);
    expect(splitLines("x\r\ny\n")).toEqual(["x\r", "y"]);
    expect(displayText("a\n")).toBe("a");
  });
});

describe("highlightPlan", () => {
  it("never highlights above 500 KB or for plaintext", () => {
    expect(highlightPlan(HIGHLIGHT_MAX_BYTES + 1, "python")).toEqual({ mode: "none" });
    expect(highlightPlan(10, "plaintext")).toEqual({ mode: "none" });
  });
  it("uses the author's language when it is one we load", () => {
    expect(highlightPlan(HIGHLIGHT_MAX_BYTES, "rust")).toEqual({ mode: "language", language: "rust" });
  });
  it("auto-detects for auto, no language, or one we do not load", () => {
    expect(highlightPlan(10, undefined)).toEqual({ mode: "auto" });
    expect(highlightPlan(10, "auto")).toEqual({ mode: "auto" });
    expect(highlightPlan(10, "cobol")).toEqual({ mode: "auto" });
  });
  it("samples 100 KB for detection", () => expect(AUTO_SAMPLE_CHARS).toBe(100 * 1024));
});

describe("languageLabel", () => {
  it("maps ids to their labels and passes unknown ids through", () => {
    expect(languageLabel("cpp")).toBe("c++");
    expect(languageLabel("plaintext")).toBe("plain text");
    expect(languageLabel("cobol")).toBe("cobol");
  });
});

describe("splitHighlighted", () => {
  it("closes and reopens spans that cross a newline", () => {
    const html = 'a <span class="hljs-comment">/* x\ny */</span> b\nc';
    expect(splitHighlighted(html)).toEqual([
      'a <span class="hljs-comment">/* x</span>',
      '<span class="hljs-comment">y */</span> b',
      "c",
    ]);
  });
  it("handles nested spans", () => {
    const html = '<span class="a"><span class="b">1\n2</span>3\n4</span>';
    expect(splitHighlighted(html)).toEqual([
      '<span class="a"><span class="b">1</span></span>',
      '<span class="a"><span class="b">2</span>3</span>',
      '<span class="a">4</span>',
    ]);
  });
  it("escapes every tag that is not a highlight.js span, and unmatched closers", () => {
    const [line] = splitHighlighted('x<img src=x onerror=alert(1)>y<span class="a" onclick="z">z</span>');
    expect(line).toBe('x&lt;img src=x onerror=alert(1)>y&lt;span class="a" onclick="z">z&lt;/span>');
    expect(line).not.toMatch(/<(?!\/?span)/);
  });
});

describe("viewFailure", () => {
  it("maps a 404 to not-found, crypto errors to bad-key and the rest to failed", () => {
    expect(viewFailure(new ApiError(404, "not_found"))).toBe("not-found");
    expect(viewFailure(new PasteCryptoError("decrypt_failed"))).toBe("bad-key");
    expect(viewFailure(new ApiError(500, "internal"))).toBe("failed");
    expect(viewFailure(new TypeError("network"))).toBe("failed");
  });
});
