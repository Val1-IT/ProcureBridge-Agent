import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", ".next", "dist"],
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "lib/domain/approval.ts",
        "lib/domain/guardrails.ts",
        "lib/domain/call-machine.ts",
        "lib/domain/results.ts",
        "lib/demo/reducer.ts",
        "lib/demo/persistence.ts",
        "lib/calle/webhook-handler.ts",
        "lib/repository/mappers/*.ts",
        "lib/dealtwin/domain/**/*.ts",
        "lib/dealtwin/compiler/**/*.ts",
        "lib/dealtwin/proof/**/*.ts",
        "lib/dealtwin/recompiler/**/*.ts",
        "lib/dealtwin/application/**/*.ts",
      ],
      thresholds: {
        lines: 70, functions: 70, branches: 60, statements: 70,
        "lib/dealtwin/domain/**": {lines:70,functions:70,branches:60,statements:70},
        "lib/dealtwin/compiler/**": {lines:70,functions:70,branches:60,statements:70},
        "lib/dealtwin/proof/**": {lines:70,functions:70,branches:60,statements:70},
        "lib/dealtwin/recompiler/**": {lines:70,functions:70,branches:60,statements:70},
        "lib/dealtwin/application/**": {lines:70,functions:70,branches:60,statements:70},
      },
    },
  },
});
