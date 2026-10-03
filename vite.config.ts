import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    cloudflare({ configPath: "./wrangler.jsonc", viteEnvironment: { name: "ssr" } }),
    tanstackStart({
      srcDirectory: "src/client",
      router: {
        entry: "router.tsx",
        routesDirectory: "routes",
        generatedRouteTree: "routeTree.gen.ts",
      },
      client: { entry: "client.tsx" },
      server: { entry: "../server.ts" },
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    sourcemap: true,
  },
});
