/** Paths the Hono app answers. Everything else is a page, rendered by TanStack Start. */
const WORKER_OWNED = /^\/api\//;

export const isWorkerOwned = (pathname: string) => WORKER_OWNED.test(pathname);
