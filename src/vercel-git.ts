import { execFile } from "node:child_process";
import { relative } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
export interface GitRemote {
  name: string;
  url: string;
  provider: string;
  repository: string;
}
export function parseGitRemote(name: string, raw: string): GitRemote {
  try {
    const url = new URL(
      raw.replace(/^git@(?<host>[^:]+):/u, "ssh://git@$<host>/")
    );
    const provider = (
      {
        "github.com": "github",
        "gitlab.com": "gitlab",
        "bitbucket.org": "bitbucket",
      } as Record<string, string>
    )[url.hostname];
    const repository = url.pathname.replace(/^\//u, "").replace(/\.git$/u, "");
    if (
      !provider ||
      !["https:", "ssh:"].includes(url.protocol) ||
      url.password ||
      (url.username && !(url.protocol === "ssh:" && url.username === "git")) ||
      url.port ||
      url.search ||
      url.hash ||
      !/^[\w.-]+(?:\/[\w.-]+)+$/u.test(repository) ||
      repository.split("/").some((part) => [".", ".."].includes(part))
    ) {
      throw new Error("Invalid remote.");
    }
    return {
      name,
      url: `https://${url.hostname}/${repository}`,
      provider,
      repository,
    };
  } catch {
    throw new Error(
      `Remote ${name} is unsupported or contains credentials. Use a credential-free GitHub.com, GitLab.com or Bitbucket.org HTTPS/SSH remote. Self-hosted and other providers require their official Vercel integration; no remote was changed.`
    );
  }
}
export async function gitRead(root: string, args: string[]) {
  try {
    return (
      await execute("git", args, {
        cwd: root,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        timeout: 30_000,
        maxBuffer: 2_000_000,
      })
    ).stdout.trim();
  } catch {
    throw new Error(
      "Git could not verify the repository. Check Git authentication and the published main branch, then rerun dinvolt vercel setup. No remote or branch was changed."
    );
  }
}
export async function inspectGit(root: string) {
  const top = await gitRead(root, ["rev-parse", "--show-toplevel"]);
  const names = (await gitRead(root, ["remote"])).split("\n").filter(Boolean);
  if (!names.length) {
    throw new Error(
      "Publish your repository and main branch yourself, add its Git remote, then rerun dinvolt vercel setup."
    );
  }
  // Selection happens before reading URLs, so an unrelated unsupported remote is harmless.
  return {
    names,
    rootDirectory: relative(top, root).replaceAll("\\", "/") || null,
    dirty: Boolean(await gitRead(root, ["status", "--porcelain"])),
  };
}
export async function inspectRemote(
  root: string,
  name: string,
  read = gitRead
) {
  const urls = (await read(root, ["remote", "get-url", "--all", name])).split(
    "\n"
  );
  if (urls.length !== 1) {
    throw new Error(
      "The selected remote has multiple URLs. Select an unambiguous remote before setup."
    );
  }
  const remote = parseGitRemote(name, urls[0] ?? "");
  const published = await read(root, [
    "ls-remote",
    "--exit-code",
    name,
    "refs/heads/main",
  ]);
  if (!/^[\da-f]+\s+refs\/heads\/main$/u.test(published)) {
    throw new Error(
      "Publish main on the selected remote before connecting Vercel."
    );
  }
  return remote;
}

export interface VercelGitLink {
  type: string;
  org?: string;
  repo?: string;
  owner?: string;
  slug?: string;
  projectUrl?: string;
  productionBranch?: string;
}
export function matchesGitLink(link: VercelGitLink, remote: GitRemote) {
  if (
    link.type === "gitlab" &&
    remote.provider === "gitlab" &&
    link.projectUrl
  ) {
    return (
      parseGitRemote("linked GitLab repository", link.projectUrl).url ===
      remote.url
    );
  }
  if (link.type === "bitbucket" && remote.provider === "bitbucket") {
    return `${link.owner}/${link.slug}` === remote.repository;
  }
  return (
    ["github", "github-limited"].includes(link.type) &&
    remote.provider === "github" &&
    `${link.org}/${link.repo}`.toLowerCase() === remote.repository.toLowerCase()
  );
}
