import { beforeEach, describe, expect, it } from "vitest";
import {
  addHistory,
  clearHistory,
  findHistory,
  forgetHistory,
  type HistoryItem,
  listHistory,
} from "../../src/client/lib/history";

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

const tok = (c: string) => c.repeat(43);
const item = (id: string, expiresAt: number | null = null): HistoryItem => ({
  id,
  ikm: tok("k"),
  ownerToken: tok("o"),
  createdAt: 1,
  expiresAt,
  burn: false,
  kind: "text",
});

beforeEach(() => store.clear());

describe("local paste history", () => {
  it("lists newest first, replaces a re-added id and caps at 50", () => {
    for (let i = 0; i < 55; i++) addHistory(item(`paste${String(i).padStart(7, "0")}`));
    addHistory(item("paste0000054"));
    const list = listHistory();
    expect(list).toHaveLength(50);
    expect(list[0].id).toBe("paste0000054");
    expect(list.filter((i) => i.id === "paste0000054")).toHaveLength(1);
  });

  it("drops expired entries on load and saves the pruned list", () => {
    addHistory(item("alivealiveal", 2_000));
    addHistory(item("deaddeaddead", 500));
    expect(listHistory(1_000).map((i) => i.id)).toEqual(["alivealiveal"]);
    expect(findHistory("deaddeaddead")).toBeUndefined();
  });

  it("forgets one entry and clears all", () => {
    addHistory(item("aaaaaaaaaaaa"));
    addHistory(item("bbbbbbbbbbbb"));
    forgetHistory("aaaaaaaaaaaa");
    expect(listHistory().map((i) => i.id)).toEqual(["bbbbbbbbbbbb"]);
    clearHistory();
    expect(listHistory()).toEqual([]);
  });

  it("ignores corrupt or foreign data instead of throwing", () => {
    store.set("0bin-cf:history:v1", "{not json");
    expect(listHistory()).toEqual([]);
    store.set("0bin-cf:history:v1", JSON.stringify({ v: 2, items: [] }));
    expect(listHistory()).toEqual([]);
  });

  it("keeps working when storage throws", () => {
    const original = globalThis.localStorage;
    globalThis.localStorage = {
      ...original,
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    } as Storage;
    expect(() => addHistory(item("cccccccccccc"))).not.toThrow();
    expect(listHistory()).toEqual([]);
    globalThis.localStorage = original;
  });
});
