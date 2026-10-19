import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import settings from "../catalog/trpc/config.json" with { type: "json" };
import { developmentUrl } from "./development.ts";
import { directoryRoot, readOrdinaryFile } from "./files.ts";

export function withTRPCProvider(layout: string) {
  return `import { TRPCReactProvider } from "@/trpc/client";\n${layout.replace(/<body>\s*\{children\}\s*<\/body>/u, "<body><TRPCReactProvider>{children}</TRPCReactProvider></body>")}`;
}

export async function prepareTRPCStarter(directory: string) {
  const root = await directoryRoot(directory);
  const originalManifest = await readOrdinaryFile(root, "package.json");
  if (
    !originalManifest ||
    !JSON.parse(originalManifest).dependencies?.["better-auth"] ||
    (await readOrdinaryFile(root, "src/lib/auth.ts")) === null
  ) {
    throw new Error(
      "tRPC setup requires Better Auth in a new Dinvolt starter."
    );
  }
  const manifest = JSON.parse(originalManifest);
  const layouts = await Promise.all(
    (["public", "admin"] as const).map(async (area) => {
      const path = `src/app/(${area})/layout.tsx`;
      const original = await readOrdinaryFile(root, path);
      const expected = (
        await readFile(
          new URL(`../catalog/ui/${area}-layout.tsx`, import.meta.url),
          "utf-8"
        )
      )
        .replaceAll("__PROJECT_NAME__", JSON.stringify(manifest.name))
        .replaceAll(
          "__DEVELOPMENT_URL__",
          JSON.stringify(developmentUrl(manifest.name))
        );
      if (
        !original ||
        original.replaceAll(/\s/gu, "") !== expected.replaceAll(/\s/gu, "")
      ) {
        throw new Error(
          `tRPC setup requires the untouched ${area} layout. Existing files were preserved.`
        );
      }
      return { path, original, content: withTRPCProvider(original) };
    })
  );
  const copies = [
    ["context.ts", "src/trpc/context.ts"],
    ["init.ts", "src/trpc/init.ts"],
    ["query-client.ts", "src/trpc/query-client.ts"],
    ["client.tsx", "src/trpc/client.tsx"],
    ["server.tsx", "src/trpc/server.tsx"],
    ["router.ts", "src/trpc/routers/app.ts"],
    ["users.ts", "src/trpc/routers/users.ts"],
    ["users-data.ts", "src/trpc/routers/users-data.ts"],
    ["csv.ts", "src/lib/csv.ts"],
    ["table-query.ts", "src/lib/table-query.ts"],
    ["users-query.ts", "src/lib/users-query.ts"],
    ["route.ts", "src/app/api/trpc/[trpc]/route.ts"],
    ["README.md", "docs/trpc.md"],
  ] as const;
  const files = await Promise.all(
    copies.map(async ([source, target]) => ({
      target,
      content: await readFile(
        new URL(`../catalog/trpc/${source}`, import.meta.url),
        "utf-8"
      ),
    }))
  );
  for (const { target } of files) {
    if ((await readOrdinaryFile(root, target)) !== null) {
      throw new Error(
        `tRPC setup would replace ${target}. Existing files were preserved.`
      );
    }
  }
  const originalAgents = await readOrdinaryFile(root, "AGENTS.md");
  const instructions = await readFile(
    new URL("../catalog/trpc/agent-instructions.md", import.meta.url),
    "utf-8"
  );
  manifest.dependencies = {
    ...manifest.dependencies,
    ...settings.dependencies,
  };
  const written: string[] = [];
  try {
    for (const file of files) {
      await mkdir(dirname(join(root, file.target)), { recursive: true });
      await writeFile(join(root, file.target), file.content, { flag: "wx" });
      written.push(file.target);
    }
    for (const layout of layouts) {
      await writeFile(join(root, layout.path), layout.content);
    }
    await writeFile(
      join(root, "package.json"),
      `${JSON.stringify(manifest, null, 2)}\n`
    );
    await writeFile(
      join(root, "AGENTS.md"),
      `${originalAgents?.trimEnd() ?? ""}\n\n${instructions}`.trimStart()
    );
  } catch (error) {
    await writeFile(join(root, "package.json"), originalManifest);
    for (const layout of layouts) {
      await writeFile(join(root, layout.path), layout.original);
    }
    if (originalAgents === null) {
      await rm(join(root, "AGENTS.md"), { force: true });
    } else {
      await writeFile(join(root, "AGENTS.md"), originalAgents);
    }
    await Promise.all(written.map((name) => rm(join(root, name))));
    throw error;
  }
}
