import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

import { repositoryIgnores } from "./tooling/ignores.ts";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [...(ultracite.ignorePatterns ?? []), ...repositoryIgnores],
});
