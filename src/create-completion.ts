import { styleText } from "node:util";

import { developmentUrl } from "./development.ts";
import { developmentCommand } from "./setup.ts";
import type { PackageManager } from "./setup.ts";

const heading = (text: string) => styleText("bold", text);
const command = (text: string) => styleText(["bold", "cyan"], text);
const detail = (text: string) => styleText("gray", text);

export function developmentInstructions(options: {
  name: string;
  packageManager: PackageManager;
  newDirectory: boolean;
  admin: boolean;
}) {
  const sections = [
    [
      heading("1. Start the app"),
      ...(options.newDirectory
        ? [`   ${command(`cd ${JSON.stringify(options.name)}`)}`]
        : []),
      `   ${command(developmentCommand(options.packageManager))}`,
    ].join("\n"),
    [
      heading("2. Open your site"),
      `   ${styleText(["cyan", "underline"], developmentUrl(options.name))}`,
    ].join("\n"),
  ];
  if (options.admin) {
    sections.push(
      [
        heading("3. Connect your database"),
        "   When your database credentials are ready, run:",
        "",
        `   ${command("dinvolt setup")}`,
        "",
        detail(
          "   Checks existing environment variables, asks for missing credentials"
        ),
        detail("   and helps create your first administrator."),
      ].join("\n")
    );
  }
  sections.push(
    "When ready to publish: create and push your Git repository/main branch yourself, then run dinvolt vercel setup. Future pushes or merges to main deploy through Vercel Git integration.",
    `Customize ${styleText("yellow", "src/config/site.ts")} for your name, description and SEO.`,
    [
      detail(
        "Portless may ask to trust HTTPS and allow port 443 on first run."
      ),
      `${detail("Help:")} ${styleText("yellow", "docs/development.md")}`,
    ].join("\n")
  );
  return sections.join("\n\n");
}
