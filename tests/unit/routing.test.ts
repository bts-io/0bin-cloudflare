import { describe, expect, it } from "vitest";
import { isWorkerOwned } from "../../src/shared/routing";

describe("isWorkerOwned", () => {
  it("sends the API to Hono", () => {
    expect(isWorkerOwned("/api/health")).toBe(true);
    expect(isWorkerOwned("/api/x/y")).toBe(true);
  });
  it("leaves pages to TanStack Start", () => {
    expect(isWorkerOwned("/")).toBe(false);
    expect(isWorkerOwned("/api")).toBe(false);
    expect(isWorkerOwned("/apix/health")).toBe(false);
  });
});
