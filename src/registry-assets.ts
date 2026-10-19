import { fileURLToPath } from "node:url";

import { directoryRoot, readOrdinaryFileBytes, resolveFile } from "./files.ts";

export async function loadRegistryAssets(
  assets: { path: string; target: string }[] = []
) {
  // shadcn registry content is text; binary assets bypass its source transforms.
  const root = await directoryRoot(
    fileURLToPath(new URL("../catalog/registry/", import.meta.url))
  );
  return Promise.all(
    assets.map(async (asset) => {
      if (!asset.target?.startsWith("~/src/")) {
        throw new Error(`Invalid registry asset destination: ${asset.target}.`);
      }
      const target = asset.target.slice(2);
      resolveFile(root, target);
      const content = await readOrdinaryFileBytes(root, asset.path);
      if (content === null) {
        throw new Error(`Missing registry asset: ${asset.path}.`);
      }
      return { target, content };
    })
  );
}
