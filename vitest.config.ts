import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const bindings = async () => ({ TEST_MIGRATIONS: await readD1Migrations("./migrations") });

// Three projects: pure unit tests in Node, the Hono API in workerd with a migrated D1, and the built Worker
// (vite build first) for server-rendered documents.
export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" } },
      {
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: "./wrangler.jsonc" },
            main: "./src/worker/index.ts",
            miniflare: { bindings: { ...(await bindings()), CREATE_MODE: "open" } },
          })),
        ],
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["./tests/integration/setup.ts"],
        },
      },
      {
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: "./dist/server/wrangler.json" },
            miniflare: { bindings: await bindings() },
          })),
        ],
        test: {
          name: "ssr",
          include: ["tests/ssr/**/*.test.ts"],
          setupFiles: ["./tests/integration/setup.ts"],
        },
      },
    ],
  },
});
