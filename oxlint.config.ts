import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import next from "ultracite/oxlint/next";
import react from "ultracite/oxlint/react";

import { repositoryIgnores } from "./tooling/ignores.ts";

export default defineConfig({
  env: { ...core.env, node: true, bun: true },
  extends: [core],
  ignorePatterns: [...(core.ignorePatterns ?? []), ...repositoryIgnores],
  rules: {
    // Existing exported helpers use declarations; both function styles are valid.
    "func-style": "off",
    "no-use-before-define": ["error", { functions: false, typedefs: false }],
    // Registry metadata and configuration objects can have meaningful key order.
    "sort-keys": "off",
    // Keep explicit branches and compact selection expressions in the CLI.
    "no-nested-ternary": "off",
    "unicorn/prefer-ternary": "off",
    "unicorn/no-await-expression-member": "off",
    // Named Node path helpers match this repository's existing module style.
    "unicorn/import-style": [
      "error",
      { styles: { "node:path": { named: true } } },
    ],
    // Scaffolding and cleanup deliberately serialize dependent filesystem work.
    "no-await-in-loop": "off",
  },
  overrides: [
    {
      files: ["**/*.tsx"],
      plugins: [...(core.plugins ?? []), ...(react.plugins ?? [])],
      rules: {
        ...react.rules,
        "react/function-component-definition": "off",
      },
    },
    {
      files: ["catalog/**/*.tsx", "playground/**/*.tsx"],
      plugins: [
        ...(core.plugins ?? []),
        ...(react.plugins ?? []),
        ...(next.plugins ?? []),
      ],
      rules: next.rules,
    },
    {
      files: ["tests/**/*.test.ts"],
      rules: {
        // Async stubs implement Promise-returning contracts; fixtures assert shape.
        "require-await": "off",
        "typescript/no-non-null-assertion": "off",
      },
    },
    {
      files: [
        "src/process.ts",
        "scripts/playground/check.ts",
        "playground/components/environment.tsx",
        "playground/public/preview-worker.js",
      ],
      rules: {
        // These modules bridge callback/event APIs into promises.
        "promise/avoid-new": "off",
      },
    },
  ],
});
