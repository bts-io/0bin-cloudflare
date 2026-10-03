import { createRouter } from "@tanstack/react-router";
import { getGlobalStartContext } from "@tanstack/react-start";
import { routeTree } from "./routeTree.gen";

/** One router per request on the server, one per tab in the browser. */
export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: "intent",
    scrollRestoration: true,
    // Per-request CSP nonce from src/server.ts; undefined in the browser, where scripts are already trusted.
    ssr: { nonce: getGlobalStartContext()?.nonce },
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
    server: { requestContext: { nonce: string } };
  }
}
