import { beforeEach, describe, expect, it } from "vitest";
import { clearTeamKey, getTeamKey, setTeamKey, teamKeyHeaders } from "../../src/client/lib/team-key";

const store = new Map<string, string>();
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

beforeEach(() => {
  globalThis.localStorage = storage;
  store.clear();
  clearTeamKey();
});

describe("team key", () => {
  it("is absent by default and sends no header", () => {
    expect(getTeamKey()).toBeNull();
    expect(teamKeyHeaders()).toEqual({});
  });

  it("is stored, sent as a bearer token and cleared", () => {
    setTeamKey("s3cret");
    expect(getTeamKey()).toBe("s3cret");
    expect(teamKeyHeaders()).toEqual({ authorization: "Bearer s3cret" });
    clearTeamKey();
    expect(getTeamKey()).toBeNull();
  });

  it("falls back to memory when storage is blocked", () => {
    globalThis.localStorage = {
      ...storage,
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    } as Storage;
    setTeamKey("kept");
    expect(getTeamKey()).toBe("kept");
  });
});
