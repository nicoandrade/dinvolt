const managers = ["npm", "bun", "pnpm", "yarn"] as const;
type PackageManager = (typeof managers)[number];

const runners = {
  npm: "npx",
  bun: "bunx",
  pnpm: "pnpm dlx",
  yarn: "yarn dlx",
} as const;

const shellFence =
  /^(?<marker>`{3,})(?<language>sh|bash|shell)\n(?<body>[\s\S]*?)^\k<marker>[ \t]*$/gmu;
const packageRunner = /^(?<indent>\s*)npx(?: (?:--yes|-y))? (?<command>.+)$/u;
const packageScript =
  /^(?<indent>\s*)(?:npm|bun|pnpm|yarn) run (?<script>\S+)(?<args>.*)$/u;
const argumentSeparator = /^ -- /u;
const explicitManager = /--package-manager(?:=|\s+)(?:npm|bun|pnpm|yarn)\b/gu;

function convertLine(line: string, manager: PackageManager): string {
  const selected = line.replace(
    explicitManager,
    `--package-manager ${manager}`
  );
  const runner = packageRunner.exec(selected);
  if (runner?.groups) {
    return manager === "npm"
      ? selected
      : `${runner.groups.indent}${runners[manager]} ${runner.groups.command}`;
  }
  const script = packageScript.exec(selected);
  if (!script?.groups) {
    return selected;
  }
  const args = (script.groups.args ?? "").replace(argumentSeparator, " ");
  const separator = manager === "npm" && args.trim() ? " --" : "";
  return `${script.groups.indent}${manager} run ${script.groups.script}${separator}${args}`;
}

/** Render ordinary repository shell examples with Blume's native code switcher. */
export function withPackageManagerTabs(markdown: string): string {
  return markdown.replace(
    shellFence,
    (fence: string, marker: string, language: string, body: string) => {
      const lines = body.trimEnd().split("\n");
      if (
        !lines.some(
          (line) => packageRunner.test(line) || packageScript.test(line)
        )
      ) {
        return fence;
      }
      const panels = managers.map((manager) => {
        const command = lines
          .map((line) => convertLine(line, manager))
          .join("\n");
        return `${marker}${language} ${manager}\n${command}\n${marker}`;
      });
      return `<CodeGroup>\n\n${panels.join("\n\n")}\n\n</CodeGroup>`;
    }
  );
}
