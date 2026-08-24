import { defineConfig } from "vitest/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(__dirname, "../../../apps/api");

export default defineConfig({
  root: __dirname,
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    hookTimeout: 60000,
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
      exclude: [
        "fixtures/**",
        "seed.ts",
        "vitest.config.ts",
        "tests/setup.ts",
        "handlers/index.ts",
        "handlers/types.ts",
      ],
    },
  },
  resolve: {
    alias: [
      { find: "zod", replacement: resolve(apiRoot, "node_modules/zod") },
      {
        find: "@agentflow/shared",
        replacement: resolve(apiRoot, "node_modules/@agentflow/shared"),
      },
    ],
  },
});
