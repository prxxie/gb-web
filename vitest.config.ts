import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    include: [
      "packages/core/tests/**/*.test.ts",
      "apps/worker/tests/**/*.test.ts",
      "apps/web/tests/**/*.test.tsx",
      "tests/meta/**/*.test.ts",
    ],
    environment: "node",
    globals: false,
    alias: {
      "@gbw/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
    },
    reporters: ["default"],
    testTimeout: 20_000,
    css: false,
    setupFiles: ["apps/web/tests/setup.ts"],
  },
});
