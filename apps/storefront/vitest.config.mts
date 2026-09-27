import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // @medusajs/js-sdk ships .js.map files whose sourceMappingURL points at .ts
  // sources not included in the published package. Vite's transform pipeline
  // warns "Sourcemap ... points to missing source files" once per SDK file on
  // every test run; it's noise about the SDK's own build output that a
  // per-message logger filter doesn't reach (Vitest's test workers don't use
  // this config's `logger` instance), so we drop Vite's own log level to
  // errors-only. Vitest's test/reporter output is unaffected.
  logLevel: "error",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Deterministic env for tests, independent of .env.local's real key.
    env: {
      NEXT_PUBLIC_MEDUSA_BACKEND_URL: "http://localhost:9000",
      NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: "pk_test_dummy",
    },
  },
});
