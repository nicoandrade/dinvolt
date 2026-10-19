import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertPlayground } from "../scripts/playground/sync.ts";

test("the internal synchronizer refuses another project even with a copied ownership marker", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dinvolt-playground-guard-"));
  try {
    await mkdir(join(directory, ".dinvolt"));
    await writeFile(
      join(directory, ".dinvolt/internal-playground.json"),
      JSON.stringify({ owner: "dinvolt-internal-playground", files: [] })
    );
    await expect(assertPlayground(directory)).rejects.toThrow(
      "outside the internal playground"
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
