import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: [path.resolve(__dirname, "./vitest.setup.ts")],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov", "html"],
      include: ["handlers/**/*.ts", "runner.ts", "credenciais.ts", "wf1-workflow.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
      exclude: ["**/*.d.ts", "**/node_modules/**", "test/**"],
    },
    testTimeout: 30_000,
    hookTimeout: 10_000,
  },
  resolve: {
    alias: {
      "@agentflow/shared": path.resolve(__dirname, "../../packages/shared/src"),
    },
  },
});
