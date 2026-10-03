import { afterEach, describe, expect, it } from "vitest";
import {
  adminFailure,
  ageText,
  clearToken,
  expiresText,
  loadToken,
  parsePasteRef,
  saveToken,
  TOKEN_KEY,
} from "../../src/client/lib/admin";
import { ApiError, bearerHeaders } from "../../src/client/lib/api";
import { AdminPasteList, AdminPurgeResult, AdminStats } from "../../src/shared/schemas/admin";

const ID = "abcDEF123_-x";
const KEY = "k".repeat(43);

describe("parsePasteRef", () => {
  it("accepts a bare id, trimmed", () => {
    expect(parsePasteRef(ID)).toBe(ID);
    expect(parsePasteRef(`  ${ID}\n`)).toBe(ID);
  });

  it("takes only the id from a full link and drops the fragment", () => {
    for (const link of [
      `https://paste.example.com/p/${ID}#${KEY}`,
      `http://localhost:5173/p/${ID}#${KEY}`,
      `/p/${ID}#${KEY}`,
      `https://paste.example.com/p/${ID}`,
      `https://paste.example.com/p/${ID}/`,
      `https://paste.example.com/p/${ID}?x=1#${KEY}`,
    ]) {
      const id = parsePasteRef(link);
      expect(id, link).toBe(ID);
      expect(id).not.toContain(KEY);
    }
  });

  it("rejects junk", () => {
    for (const junk of [
      "",
      "   ",
      "short",
      `${ID}x`,
      "abc def ghij",
      `https://paste.example.com/x/${ID}#${KEY}`,
      `https://paste.example.com/p/${ID}x#${KEY}`,
      `https://paste.example.com/p/${ID}/extra`,
      `ftp://paste.example.com/p/${ID}`,
      `#${KEY}`,
      `https://evil.example/?u=/p/${ID}`,
    ]) {
      expect(parsePasteRef(junk), junk).toBeNull();
    }
  });
});

describe("bearerHeaders", () => {
  it("sends nothing without a token (Access cookie mode)", () => {
    expect(bearerHeaders(null)).toEqual({});
  });

  it("sends a bearer header with a token", () => {
    expect(bearerHeaders("s3cret")).toEqual({ authorization: "Bearer s3cret" });
  });
});

describe("token session store", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "sessionStorage");
  });

  it("saves, loads and clears under the fixed key", () => {
    const store = new Map<string, string>();
    globalThis.sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as Storage;
    expect(loadToken()).toBeNull();
    saveToken("t0k");
    expect(store.get(TOKEN_KEY)).toBe("t0k");
    expect(loadToken()).toBe("t0k");
    clearToken();
    expect(loadToken()).toBeNull();
  });

  it("degrades to no token when storage throws", () => {
    const boom = () => {
      throw new Error("blocked");
    };
    globalThis.sessionStorage = { getItem: boom, setItem: boom, removeItem: boom } as unknown as Storage;
    expect(loadToken()).toBeNull();
    expect(() => saveToken("t0k")).not.toThrow();
    expect(() => clearToken()).not.toThrow();
  });
});

describe("response schemas", () => {
  it("parses a pastes page and rejects a bad kind", () => {
    const page = {
      items: [
        { id: ID, kind: "text", size: 120, burn: false, createdAt: 1, expiresAt: null },
        { id: "zzzzzzzzzzzz", kind: "file", size: 9, burn: true, createdAt: 2, expiresAt: 3 },
      ],
      nextCursor: "2:zzzzzzzzzzzz",
    };
    expect(AdminPasteList.parse(page)).toEqual(page);
    expect(AdminPasteList.parse({ items: [], nextCursor: null }).nextCursor).toBeNull();
    expect(
      AdminPasteList.safeParse({ items: [{ ...page.items[0], kind: "image" }], nextCursor: null }).success,
    ).toBe(false);
  });

  it("parses stats and purge results", () => {
    const stats = { active: 3, burnPending: 1, totalBytes: 2048, pastesCreated: 10 };
    expect(AdminStats.parse(stats)).toEqual(stats);
    expect(AdminStats.safeParse({ active: 3 }).success).toBe(false);
    expect(AdminPurgeResult.parse({ deleted: 4 })).toEqual({ deleted: 4 });
    expect(AdminPurgeResult.safeParse({ deleted: -1 }).success).toBe(false);
  });
});

describe("labels and failures", () => {
  const now = 1_700_000_000_000;

  it("labels created times", () => {
    expect(ageText(now - 10_000, now)).toBe("just now");
    expect(ageText(now - 5 * 60_000, now)).toBe("5m ago");
    expect(ageText(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(ageText(now - 4 * 86_400_000, now)).toBe("4d ago");
    expect(ageText(Date.UTC(2023, 0, 2), now)).toBe("2023-01-02");
  });

  it("labels expiry", () => {
    expect(expiresText(null, now)).toBe("never");
    expect(expiresText(now - 1, now)).toBe("expired");
    expect(expiresText(now + 3 * 3_600_000, now)).toBe("expires in 3h");
  });

  it("maps statuses to page states", () => {
    expect(adminFailure(new ApiError(401, "unauthorized"))).toBe("token");
    expect(adminFailure(new ApiError(403, "forbidden"))).toBe("forbidden");
    expect(adminFailure(new ApiError(404, "not_found"))).toBe("disabled");
    expect(adminFailure(new ApiError(500, "x"))).toBe("failed");
    expect(adminFailure(new TypeError("network"))).toBe("failed");
  });
});
