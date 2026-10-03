/**
 * Loader for Cloudflare Turnstile's script (explicit render). Nothing here touches the DOM until `loadTurnstile`
 * is called, so the module is safe to import during SSR and in unit tests.
 */

export type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  execute: (id: string) => void;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** The widget could not produce a token: script blocked, challenge failed or the widget errored. */
export class BotCheckError extends Error {
  constructor() {
    super("turnstile");
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let loading: Promise<TurnstileApi> | undefined;

/** Loads the script once; a failed load is forgotten so the next attempt tries again. */
export function loadTurnstile(): Promise<TurnstileApi> {
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new BotCheckError()));
    script.onerror = () => {
      script.remove();
      reject(new BotCheckError());
    };
    document.head.appendChild(script);
  }).catch((err: unknown) => {
    loading = undefined;
    throw err;
  });
  return loading;
}

/** One invisible widget: `token` runs a challenge on demand, `reset` discards the (single-use) token after use. */
export type BotCheck = {
  prepare: () => Promise<unknown>;
  token: () => Promise<string>;
  reset: () => void;
  remove: () => void;
};

type Pending = { resolve: (token: string) => void; reject: (err: Error) => void };

/**
 * Renders the invisible widget into `el` (explicit render, execution on demand, shown only when Cloudflare wants
 * an interaction). A failed load or render is forgotten, so the next `token` call starts over.
 */
export function createBotCheck(el: HTMLElement, siteKey: string): BotCheck {
  let widget: Promise<{ api: TurnstileApi; id: string }> | null = null;
  let pending: Pending | null = null;

  const settle = (token: string | null) => {
    const waiting = pending;
    pending = null;
    if (token) waiting?.resolve(token);
    else waiting?.reject(new BotCheckError());
  };

  const mount = () => {
    if (widget) return widget;
    const ready = loadTurnstile().then((api) => {
      const id = api.render(el, {
        sitekey: siteKey,
        execution: "execute",
        appearance: "interaction-only",
        retry: "never",
        callback: (token: string) => settle(token),
        "error-callback": () => {
          settle(null);
          return true;
        },
        "timeout-callback": () => settle(null),
      });
      return { api, id };
    });
    ready.catch(() => {
      if (widget === ready) widget = null;
    });
    widget = ready;
    return ready;
  };

  return {
    prepare: mount,
    token: async () => {
      const { api, id } = await mount();
      settle(null);
      return new Promise<string>((resolve, reject) => {
        pending = { resolve, reject };
        api.execute(id);
      });
    },
    reset: () => {
      settle(null);
      widget?.then(({ api, id }) => api.reset(id)).catch(() => {});
    },
    remove: () => {
      settle(null);
      widget?.then(({ api, id }) => api.remove(id)).catch(() => {});
      widget = null;
    },
  };
}
