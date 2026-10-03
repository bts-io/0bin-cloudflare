import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnstileApi } from "../../src/client/lib/turnstile";

type Opts = Record<string, (arg?: string) => unknown>;

/** A stand-in for `window.turnstile`: records calls and lets the test fire the widget callbacks. */
function fakeTurnstile() {
  let opts: Opts = {};
  const api = {
    render: vi.fn((_el: HTMLElement, o: Record<string, unknown>) => {
      opts = o as Opts;
      return "w1";
    }),
    execute: vi.fn(),
    reset: vi.fn(),
    remove: vi.fn(),
  } satisfies TurnstileApi;
  return { api, fire: (name: string, arg?: string) => opts[name]!(arg), options: () => opts };
}

const el = {} as HTMLElement;
const tick = () => new Promise((r) => setTimeout(r, 0));

let fake: ReturnType<typeof fakeTurnstile>;
// A fresh module per test: the loader keeps the script promise for the page's lifetime.
let mod: typeof import("../../src/client/lib/turnstile");
beforeEach(async () => {
  fake = fakeTurnstile();
  vi.stubGlobal("window", { turnstile: fake.api });
  vi.resetModules();
  mod = await import("../../src/client/lib/turnstile");
});
afterEach(() => vi.unstubAllGlobals());

describe("createBotCheck", () => {
  it("renders once, invisible and on demand, with the site key", async () => {
    const check = mod.createBotCheck(el, "0xKEY");
    await check.prepare();
    await check.prepare();
    expect(fake.api.render).toHaveBeenCalledTimes(1);
    expect(fake.options()).toMatchObject({
      sitekey: "0xKEY",
      execution: "execute",
      appearance: "interaction-only",
      retry: "never",
    });
    expect(fake.api.execute).not.toHaveBeenCalled();
  });

  it("runs a challenge per token request and resolves with the token", async () => {
    const check = mod.createBotCheck(el, "0xKEY");
    const token = check.token();
    await tick();
    expect(fake.api.execute).toHaveBeenCalledWith("w1");
    fake.fire("callback", "tok-1");
    await expect(token).resolves.toBe("tok-1");
  });

  it.each(["error-callback", "timeout-callback"])("rejects with BotCheckError on %s", async (name) => {
    const check = mod.createBotCheck(el, "0xKEY");
    const token = check.token();
    await tick();
    fake.fire(name);
    await expect(token).rejects.toBeInstanceOf(mod.BotCheckError);
  });

  it("resets the widget after use and drops a challenge still waiting", async () => {
    const check = mod.createBotCheck(el, "0xKEY");
    const token = check.token();
    await tick();
    check.reset();
    await expect(token).rejects.toBeInstanceOf(mod.BotCheckError);
    await tick();
    expect(fake.api.reset).toHaveBeenCalledWith("w1");
  });

  it("removes the widget", async () => {
    const check = mod.createBotCheck(el, "0xKEY");
    await check.prepare();
    check.remove();
    await tick();
    expect(fake.api.remove).toHaveBeenCalledWith("w1");
  });
});
