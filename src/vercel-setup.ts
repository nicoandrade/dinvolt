import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import * as prompts from "@clack/prompts";

import { readOrdinaryFile, requiredProjectFile } from "./files.ts";
import { findProject } from "./project-configuration.ts";
import type { ExistingProject } from "./project-configuration.ts";
import { setupExistingProject } from "./project-setup.ts";
import { vercelAPI, vercelJSON, vercelRunner } from "./vercel-command.ts";
import type { VercelRunner } from "./vercel-command.ts";
import {
  assertSafeRemoteEnvironment,
  authSecretPlan,
  baseVariable,
  databaseHostingValues,
  originError,
  requiredHostingKeys,
} from "./vercel-environment.ts";
import type {
  HostingTarget,
  PlannedVariable,
  RemoteVariable,
} from "./vercel-environment.ts";
import {
  gitRead,
  inspectGit,
  inspectRemote,
  matchesGitLink,
} from "./vercel-git.ts";
import type { GitRemote, VercelGitLink } from "./vercel-git.ts";
import { answer, CancelledError } from "./wizard-prompts.ts";

export interface HostingPrompts {
  choose: (
    message: string,
    options: { value: string; label: string }[],
    id?: string
  ) => Promise<string>;
  confirm: (message: string, id?: string) => Promise<boolean>;
  text: (message: string, initial?: string, id?: string) => Promise<string>;
  secret: (message: string, id?: string) => Promise<string>;
  report: (message: string) => void;
  destination?: { team: string; project?: string; newProject?: string };
  progress?: (step: string, details?: Record<string, unknown>) => void;
}
const hostingPrompts: HostingPrompts = {
  choose: async (message, options) =>
    answer(await prompts.select({ message, options })),
  confirm: async (message) =>
    answer(await prompts.confirm({ message, initialValue: false })),
  text: async (message, initialValue) =>
    answer(await prompts.text({ message, initialValue })).trim(),
  secret: async (message) => answer(await prompts.password({ message })),
  report: (message) => prompts.log.info(message),
};
interface Team {
  id: string;
  slug: string;
  name?: string;
}
interface Project {
  id: string;
  accountId: string;
  name: string;
  framework?: string;
  rootDirectory?: string | null;
  nodeVersion?: string;
  buildCommand?: string | null;
  installCommand?: string | null;
  outputDirectory?: string | null;
  autoExposeSystemEnvs?: boolean;
  previewDeploymentsDisabled?: boolean;
  link?: VercelGitLink | null;
}
interface ProjectDomain {
  name: string;
  verified: boolean;
  gitBranch?: string | null;
  redirect?: string | null;
  customEnvironmentId?: string | null;
}
interface LocalLink {
  projectId: string;
  orgId: string;
  projectName?: string;
}
function identifier(value: unknown) {
  if (typeof value !== "string" || !/^[\w-]+$/u.test(value)) {
    throw new Error(
      "Invalid Vercel resource identifier. Restore the project link before retrying."
    );
  }
  return encodeURIComponent(value);
}
async function allPages<T>(
  run: VercelRunner,
  path: string,
  key: string,
  team?: string
): Promise<T[]> {
  const result: T[] = [];
  let next: number | undefined;
  const seen = new Set<number>();
  do {
    type Page = Record<string, unknown> & {
      pagination?: { next?: number | null };
    };
    // API commands require a scope even for /v2/teams. The native list command
    // can discover memberships before the user has selected a team.
    const page =
      path === "/v2/teams"
        ? await vercelJSON<Page>(run, {
            args: [
              "teams",
              "list",
              "--json",
              "--limit",
              "100",
              ...(next ? ["--next", String(next)] : []),
            ],
          })
        : await vercelAPI<Page>(
            run,
            `${path}${path.includes("?") ? "&" : "?"}limit=100${next ? `&until=${next}` : ""}`,
            team
          );
    if (!Array.isArray(page[key])) {
      throw new TypeError(
        "Unexpected Vercel list response. Setup stopped before proceeding with incomplete inventory."
      );
    }
    result.push(...(page[key] as T[]));
    next = page.pagination?.next ?? undefined;
    if (next && seen.has(next)) {
      throw new Error("Vercel pagination did not advance. Rerun setup.");
    }
    if (next) {
      seen.add(next);
    }
  } while (next);
  return result;
}
async function readLink(root: string): Promise<LocalLink | undefined> {
  const source = await readOrdinaryFile(root, ".vercel/project.json");
  if (source === null) {
    return;
  }
  try {
    const link = JSON.parse(source) as LocalLink;
    identifier(link.projectId);
    identifier(link.orgId);
    return link;
  } catch {
    throw new Error(
      "Invalid .vercel/project.json. Restore its original team/project link before setup."
    );
  }
}
async function saveLink(root: string, project: Project, team: Team) {
  const existing = await readLink(root);
  if (
    existing &&
    (existing.projectId !== project.id || existing.orgId !== team.id)
  ) {
    throw new Error(
      "The local Vercel link changed during setup. It was preserved; retry after reviewing it."
    );
  }
  // The documented link file is sufficient. `vercel link` also refreshes OIDC
  // in .env.local; writing only this non-secret link avoids that side effect.
  if (await gitRead(root, ["ls-files", "--", ".vercel"])) {
    throw new Error(
      ".vercel is tracked. Untrack it yourself before linking; no files were overwritten."
    );
  }
  const ignore = (await readOrdinaryFile(root, ".gitignore")) ?? "";
  if (!ignore.split(/\r?\n/u).includes("/.vercel/")) {
    await writeFile(
      join(root, ".gitignore"),
      `${ignore}${ignore.endsWith("\n") || !ignore ? "" : "\n"}/.vercel/\n`
    );
  }
  await gitRead(root, [
    "check-ignore",
    "--no-index",
    "--",
    ".vercel/project.json",
  ]);
  if (existing) {
    return;
  }
  await mkdir(join(root, ".vercel"), { recursive: true });
  await writeFile(
    join(root, ".vercel/project.json"),
    `${JSON.stringify({ projectId: project.id, orgId: team.id, projectName: project.name }, null, 2)}\n`,
    { flag: "wx" }
  );
}
function assertProject(
  project: Project,
  team: Team,
  expected: string,
  remote: GitRemote
) {
  if (
    project.accountId !== team.id ||
    (project.id !== expected && project.name !== expected)
  ) {
    throw new Error(
      "Vercel returned a different team/project. No changes will be made to that destination."
    );
  }
  if (project.link && !matchesGitLink(project.link, remote)) {
    throw new Error(
      "This Vercel project is connected to a different repository. Its integration was preserved; select the correct project explicitly."
    );
  }
}
async function verifyHostingSession(run: VercelRunner, ui: HostingPrompts) {
  try {
    await run({ args: ["whoami"] });
  } catch (error) {
    if (error instanceof CancelledError) {
      throw error;
    }
    if (
      !(await ui.confirm(
        "Vercel session could not be verified. Log in with the official CLI now?",
        "login"
      ))
    ) {
      throw new CancelledError();
    }
    await run({ args: ["login"], interactive: true });
    await run({ args: ["whoami"] });
  }
}

async function selectTeam(
  teams: Team[],
  link: LocalLink | undefined,
  ui: HostingPrompts
) {
  const requestedTeam = ui.destination
    ? teams.find(
        (entry) =>
          entry.id === ui.destination?.team ||
          entry.slug === ui.destination?.team
      )
    : undefined;
  if (
    ui.destination &&
    (!requestedTeam || (link && link.orgId !== requestedTeam.id))
  ) {
    throw new Error(
      "The requested team is unavailable or conflicts with the existing local link. No destination was changed."
    );
  }
  if (link && ui.destination?.newProject) {
    throw new Error(
      "A local Vercel project is already linked. Use --project to resume it; --new-project cannot replace the link."
    );
  }
  const teamId =
    requestedTeam?.id ??
    link?.orgId ??
    (await ui.choose(
      "Vercel team",
      teams.map((team) => ({
        value: team.id,
        label: `${team.name ?? team.slug} (${team.slug})`,
      })),
      "team"
    ));
  return teamId;
}

async function selectProject(
  root: string,
  run: VercelRunner,
  ui: HostingPrompts,
  remote: GitRemote
) {
  const link = await readLink(root);
  await verifyHostingSession(run, ui);
  const teams = await allPages<Team>(run, "/v2/teams", "teams");
  if (!teams.length) {
    throw new Error(
      "No accessible Vercel teams. Check your account's team access before retrying."
    );
  }
  const teamId = await selectTeam(teams, link, ui);
  const team = teams.find((entry) => entry.id === teamId);
  if (!team) {
    throw new Error(
      "The linked/selected team is not accessible to this Vercel session. Restore team access or sign in with the correct account; the link was preserved."
    );
  }
  let expected = link?.projectId;
  if (!expected) {
    const projects = await allPages<Project>(
      run,
      "/v9/projects",
      "projects",
      team.id
    );
    expected = await ui.choose(
      "Vercel project",
      [
        ...projects.map((project) => ({
          value: project.id,
          label: project.name,
        })),
        {
          value: "create",
          label: "Create a project without importing Git yet",
        },
      ],
      "project"
    );
    if (expected === "create") {
      const name = await ui.text(
        "New Vercel project name",
        undefined,
        "project-name"
      );
      if (
        !/^[a-z0-9][a-z0-9-]{0,99}$/u.test(name) ||
        projects.some((project) => project.name === name)
      ) {
        throw new Error(
          "Use an available lowercase project name with letters, numbers and hyphens. Choose an existing project to resume a previous setup."
        );
      }
      if (
        !(await ui.confirm(
          `Create ${team.slug}/${name}? This creates hosting configuration without importing code.`,
          "create-project"
        ))
      ) {
        throw new CancelledError();
      }
      // First-class create never receives a repository or local source.
      await run({ args: ["project", "create", name, "--scope", team.id] });
      ui.progress?.("project-created", { team: team.id, name });
      expected = name;
    }
  }
  const project = await vercelAPI<Project>(
    run,
    `/v9/projects/${identifier(expected)}`,
    team.id
  );
  assertProject(project, team, expected, remote);
  if (
    ui.destination?.project &&
    ![project.id, project.name].includes(ui.destination.project)
  ) {
    throw new Error(
      "The requested project conflicts with the local link. Existing configuration was preserved."
    );
  }
  if (
    !(await ui.confirm(
      `Use ${team.slug}/${project.name} (${project.id}) for ${remote.url}, production branch main?`,
      "use-project"
    ))
  ) {
    throw new CancelledError();
  }
  await run({ args: ["project", "inspect", project.id, "--scope", team.id] });
  await saveLink(root, project, team);
  ui.progress?.("local-link", {
    team: team.id,
    project: project.id,
    name: project.name,
  });
  return { team, project };
}
async function productionOrigin(
  run: VercelRunner,
  ui: HostingPrompts,
  project: Project,
  team: Team
) {
  let domains = await allPages<ProjectDomain>(
    run,
    `/v9/projects/${identifier(project.id)}/domains`,
    "domains",
    team.id
  );
  const candidates = domains.filter(
    (domain) =>
      !domain.gitBranch && !domain.redirect && !domain.customEnvironmentId
  );
  const selection = await ui.choose(
    "Production origin assigned to this project",
    [
      ...candidates.map((domain) => ({
        value: domain.name,
        label: `${domain.name}${domain.verified ? "" : " (verification pending)"}`,
      })),
      {
        value: "custom",
        label: "Add my own domain (no purchase or DNS changes)",
      },
    ],
    "origin"
  );
  let name = selection;
  if (selection === "custom") {
    const origin = await ui.text(
      "Public HTTPS origin you own, for example https://example.com",
      undefined,
      "origin"
    );
    const error = originError(origin);
    if (error) {
      throw new Error(error);
    }
    name = new URL(origin).hostname;
    if (
      !(await ui.confirm(
        `Associate ${name} with ${team.slug}/${project.name}? DNS must be configured by its owner.`,
        "add-domain"
      ))
    ) {
      throw new CancelledError();
    }
    await run({
      args: ["domains", "add", name, project.name, "--scope", team.id],
    });
    ui.progress?.("domain-associated", { domain: name });
    domains = await allPages<ProjectDomain>(
      run,
      `/v9/projects/${identifier(project.id)}/domains`,
      "domains",
      team.id
    );
  }
  const domain = domains.find(
    (entry) =>
      entry.name === name &&
      !entry.gitBranch &&
      !entry.redirect &&
      !entry.customEnvironmentId
  );
  if (!domain) {
    throw new Error(
      "The production domain is not assigned to this project. Configure it in Vercel and rerun setup."
    );
  }
  if (!domain.verified) {
    throw new Error(
      `Domain ownership verification is pending for ${name}. Complete the verification shown in Vercel Domains, then rerun setup. Git has not been newly connected.`
    );
  }
  const config = await vercelAPI<{ misconfigured: boolean }>(
    run,
    `/v6/domains/${encodeURIComponent(name)}/config`,
    team.id
  );
  if (config.misconfigured !== false) {
    throw new Error(
      `DNS is pending for ${name}. Follow the DNS instructions in Vercel Domains, then rerun setup. No DNS records were changed.`
    );
  }
  return `https://${name}`;
}
async function remoteEnvironment(
  run: VercelRunner,
  project: Project,
  team: Team
) {
  const response = await vercelAPI<{
    envs: RemoteVariable[];
    pagination?: { next?: number | null };
  }>(run, `/v10/projects/${identifier(project.id)}/env?decrypt=false`, team.id);
  if (
    !Array.isArray(response?.envs) ||
    (response.pagination?.next ?? null) !== null
  ) {
    throw new Error(
      "Could not inventory all Vercel variables. Setup stopped before proceeding with incomplete inventory."
    );
  }
  return response.envs;
}
function environmentSnapshot(
  variables: RemoteVariable[],
  targets: HostingTarget[]
) {
  return JSON.stringify(
    variables
      .filter((variable) =>
        targets.some((target) => [variable.target].flat().includes(target))
      )
      .map(
        ({
          id,
          key,
          target,
          gitBranch,
          customEnvironmentIds,
          type,
          visibility,
          updatedAt,
          value,
        }) => ({
          id,
          key,
          target: [target].flat().toSorted(),
          gitBranch: gitBranch ?? null,
          customEnvironmentIds: [...(customEnvironmentIds ?? [])].toSorted(),
          type,
          visibility,
          updatedAt,
          value,
        })
      )
      .toSorted((a, b) => (a.id ?? "").localeCompare(b.id ?? ""))
  );
}
async function configValue(
  run: VercelRunner,
  project: Project,
  team: Team,
  variable: RemoteVariable
) {
  if (variable.type === "sensitive" || variable.visibility === "secret") {
    return;
  }
  if (variable.type === "plain" || variable.decrypted === true) {
    return variable.value;
  }
  if (variable.type !== "encrypted" && variable.visibility !== "config") {
    return;
  }
  // Read only a planned Config value. Never decrypt the environment inventory
  // or request the value of a retained database/authentication/email secret.
  try {
    const readable = await vercelAPI<RemoteVariable>(
      run,
      `/v1/projects/${identifier(project.id)}/env/${identifier(variable.id)}`,
      team.id
    );
    if (
      readable.key === variable.key &&
      (!readable.id || readable.id === variable.id)
    ) {
      return readable.value;
    }
  } catch (error) {
    if (error instanceof CancelledError) {
      throw error;
    }
  }
}
// eslint-disable-next-line complexity -- Keep the sequential per-target plan and replacement decisions together.
async function collectEnvironment(
  project: ExistingProject,
  run: VercelRunner,
  ui: HostingPrompts,
  remoteProject: Project,
  team: Team,
  targets: HostingTarget[],
  origin: string
) {
  const variables = await remoteEnvironment(run, remoteProject, team);
  assertSafeRemoteEnvironment(project, variables, targets);
  const plan: PlannedVariable[] = [];
  for (const target of targets) {
    plan.push(...(await databaseHostingValues(project, target)));
    if (project.admin) {
      plan.push(...authSecretPlan(variables, target));
    }
    if (target === "production") {
      plan.push({
        key: "NEXT_PUBLIC_SITE_URL",
        target,
        type: "config",
        value: origin,
      });
      if (project.admin) {
        plan.push({
          key: "BETTER_AUTH_URL",
          target,
          type: "config",
          value: origin,
        });
      }
    }
    if (
      project.admin &&
      (await ui.confirm(
        `Configure password recovery email for ${target}? Enter remote values separately; local email credentials are never copied.`,
        `email:${target}`
      ))
    ) {
      const key = await ui.secret(
        `RESEND_API_KEY for ${target}`,
        `email-key:${target}`
      );
      const from = await ui.text(
        `EMAIL_FROM for ${target}`,
        undefined,
        `email-from:${target}`
      );
      if (!key.trim() || !from.trim() || /[\r\n]/u.test(key + from)) {
        throw new Error("Provide nonempty single-line remote email values.");
      }
      plan.push(
        { key: "RESEND_API_KEY", target, type: "secret", value: key },
        { key: "EMAIL_FROM", target, type: "config", value: from }
      );
    }
  }
  const approved: PlannedVariable[] = [];
  for (const variable of plan) {
    const existing = baseVariable(variables, variable.key, variable.target);
    if (existing) {
      const currentValue =
        variable.type === "config"
          ? await configValue(run, remoteProject, team, existing)
          : undefined;
      if (variable.type === "config" && currentValue === variable.value) {
        continue;
      }
      const replace = await ui.confirm(
        `Replace ${variable.key} in ${variable.target}? Its current value is hidden. Keep it by answering No; branch overrides are preserved.`,
        `replace:${variable.target}:${variable.key}`
      );
      if (!replace) {
        if (
          ["BETTER_AUTH_URL", "NEXT_PUBLIC_SITE_URL"].includes(variable.key) &&
          currentValue !== variable.value
        ) {
          throw new Error(
            `Could not confirm the selected production origin for ${variable.key}; the existing value may be hidden or different. Explicitly replace it with the selected origin or reconcile it in Vercel, then retry.`
          );
        }
        continue;
      }
      if (
        [existing.target].flat().length !== 1 ||
        existing.customEnvironmentIds?.length
      ) {
        throw new Error(
          `${variable.key} is shared across environments. Split it explicitly in Vercel before replacing it; other environments were preserved.`
        );
      }
    }
    approved.push({ ...variable, existing });
  }
  const overrides = variables.filter(
    (variable) =>
      variable.gitBranch &&
      targets.some((target) => [variable.target].flat().includes(target))
  );
  if (overrides.length) {
    ui.report(
      `Preserving ${overrides.length} branch overrides. Review their database/auth/email settings separately before using those branches.`
    );
  }
  ui.report(
    `Variable plan (values hidden):\n${approved.map((variable) => `${variable.target}: ${variable.key} (${variable.type}, ${variable.existing ? "replace" : "add"})`).join("\n") || "Existing variables retained."}\nPreview origin uses the assigned deployment URL; production uses ${origin}.`
  );
  return { approved, snapshot: environmentSnapshot(variables, targets) };
}
async function verifyPreviewSupport(
  project: ExistingProject,
  targets: HostingTarget[]
) {
  if (!targets.includes("preview")) {
    return;
  }
  const site = await requiredProjectFile(project.root, "src/config/site.ts");
  const auth = project.admin
    ? await requiredProjectFile(project.root, "src/lib/auth-config.ts")
    : "";
  const authOrigin = project.admin
    ? await requiredProjectFile(project.root, "src/lib/auth-origin.ts")
    : "";
  if (
    !site.includes("NEXT_PUBLIC_VERCEL_URL") ||
    (project.admin &&
      (!auth.includes("getAuthOrigin") ||
        !authOrigin.includes("VERCEL_URL") ||
        !authOrigin.includes("VERCEL_ENV")))
  ) {
    throw new Error(
      "This starter predates deployment-specific Preview origins or has customized URL resolution. Add the documented Preview origin resolver to src/config/site.ts and src/lib/auth-config.ts, review and publish it before enabling Preview. See Dinvolt docs/vercel.md. Existing sources were preserved."
    );
  }
}
// eslint-disable-next-line complexity -- Ordered resumable phases keep all writes after explicit target/plan confirmation.
export async function setupVercel(
  directory: string,
  ui: HostingPrompts = hostingPrompts,
  dependencies: {
    run?: VercelRunner;
    git?: typeof inspectGit;
    remote?: typeof inspectRemote;
    setup?: typeof setupExistingProject;
  } = {}
) {
  let local = await findProject(directory);
  await readLink(local.root);
  const repositoryRoot = await gitRead(local.root, [
    "rev-parse",
    "--show-toplevel",
  ]);
  for (const root of new Set([local.root, repositoryRoot])) {
    if ((await readOrdinaryFile(root, ".vercel/repo.json")) !== null) {
      throw new Error(
        "An existing .vercel/repo.json manages this repository. Configure its project mapping with the official Vercel CLI; Dinvolt will not shadow it with a different local link."
      );
    }
  }
  const git = await (dependencies.git ?? inspectGit)(local.root);
  const remoteName =
    git.names.length === 1 && !ui.destination
      ? (git.names[0] ?? "")
      : await ui.choose(
          "Git remote to connect",
          git.names.map((name) => ({ value: name, label: name })),
          "git-remote"
        );
  if (!git.names.includes(remoteName)) {
    throw new Error("Choose one of the existing Git remotes.");
  }
  const remote = await (dependencies.remote ?? inspectRemote)(
    local.root,
    remoteName
  );
  if (git.dirty) {
    ui.report(
      "Local changes are uncommitted. Vercel builds published Git commits; review and publish your changes yourself when ready."
    );
  }
  const targets: HostingTarget[] = ["production"];
  if (
    await ui.confirm(
      local.admin
        ? "Configure Preview using staging? Staging must be prepared separately."
        : "Configure Preview deployments?",
      "preview"
    )
  ) {
    targets.push("preview");
  }
  for (const target of targets) {
    try {
      await databaseHostingValues(local, target);
    } catch (error) {
      ui.report((error as Error).message);
      if (
        !(await ui.confirm(
          "Open dinvolt setup now? It checks database connections and offers explicit initial setup/admin operations; hosting setup itself never migrates.",
          "database-setup"
        ))
      ) {
        throw error;
      }
      await (dependencies.setup ?? setupExistingProject)(local.root);
      local = await findProject(local.root);
      await databaseHostingValues(local, target);
    }
  }
  await verifyPreviewSupport(local, targets);
  const manifest = JSON.parse(
    await requiredProjectFile(local.root, "package.json")
  );
  if (
    manifest.scripts?.build !== "next build" ||
    manifest.scripts?.prebuild ||
    manifest.scripts?.postbuild ||
    [
      "vercel-build",
      "prevercel-build",
      "postvercel-build",
      "preinstall",
      "install",
      "postinstall",
      "prepublish",
      "preprepare",
      "prepare",
      "postprepare",
    ].some((name) => manifest.scripts?.[name])
  ) {
    throw new Error(
      "The build lifecycle is customized. Review it and configure hosting manually; database migrations must never run in a Vercel build."
    );
  }
  for (const name of ["vercel.ts", "vercel.toml", "now.json"]) {
    if ((await readOrdinaryFile(local.root, name)) !== null) {
      throw new Error(
        `${name} can override hosting configuration. Review it and configure hosting manually; the file was preserved.`
      );
    }
  }
  if (!["bun", "npm", "pnpm", "yarn"].includes(local.metadata.packageManager)) {
    throw new Error(
      "This package manager needs a reviewed Vercel install command. Configure it manually; automatic setup supports Bun, npm, pnpm and Yarn."
    );
  }
  const vercelConfig = await readOrdinaryFile(local.root, "vercel.json");
  if (vercelConfig) {
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(vercelConfig);
    } catch {
      throw new Error(
        "Invalid vercel.json. Repair its JSON before setup; no content was displayed."
      );
    }
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error("vercel.json must contain a configuration object.");
    }
    if (
      [
        "buildCommand",
        "installCommand",
        "framework",
        "outputDirectory",
        "env",
        "build",
        "builds",
        "ignoreCommand",
        "git",
        "github",
      ].some((key) => key in config)
    ) {
      throw new Error(
        "vercel.json overrides build, environment or Git configuration. Review these settings manually before setup; the file was preserved."
      );
    }
  }
  const run = dependencies.run ?? vercelRunner(local.root);
  const { team, project } = await selectProject(local.root, run, ui, remote);
  const origin = await productionOrigin(run, ui, project, team);
  const { approved: plan, snapshot } = await collectEnvironment(
    local,
    run,
    ui,
    project,
    team,
    targets,
    origin
  );
  ui.report(
    `Hosting plan: ${team.slug}/${project.name}\nRepository: ${remote.url}\nProduction branch: main\nFramework: Next.js · Node.js 24 · root: ${git.rootDirectory ?? "."}\nBuild/install/output: framework and lockfile defaults\nTargets: ${targets.join(", ")}\n${project.link ? "The existing Git integration remains active. Avoid pushes while applying configuration." : "Variables are saved before connecting Git. Connecting may trigger a provider-side initial build of the published repository."}\nApply reviewed migrations explicitly before the next Git build. No source upload, commit, push or deploy command is run.`
  );
  ui.progress?.("plan", {
    team: team.id,
    project: project.id,
    name: project.name,
    origin,
    targets,
    repository: remote.url,
    variables: plan.map(({ key, target, type, existing }) => ({
      key,
      target,
      type,
      action: existing ? "replace" : "add",
    })),
  });
  if (!(await ui.confirm("Apply this hosting and variable plan?", "apply"))) {
    throw new CancelledError();
  }
  const check = await vercelAPI<Project>(
    run,
    `/v9/projects/${identifier(project.id)}`,
    team.id
  );
  assertProject(check, team, project.id, remote);
  if (
    environmentSnapshot(
      await remoteEnvironment(run, project, team),
      targets
    ) !== snapshot
  ) {
    throw new Error(
      "Vercel variables changed during setup. No planned writes were applied; rerun to review the current environment and targets."
    );
  }
  // Settings omitted from this command (billing, protection, etc.) remain unchanged.
  await run({
    args: [
      "project",
      "update",
      project.id,
      "--scope",
      team.id,
      "--framework",
      "nextjs",
      "--node-version",
      "24.x",
      ...(git.rootDirectory
        ? ["--root-directory", git.rootDirectory]
        : ["--auto-detect", "root-directory"]),
      "--auto-detect",
      "build-command",
      "--auto-detect",
      "install-command",
      "--auto-detect",
      "output-directory",
      "--yes",
    ],
  });
  ui.progress?.("project-settings");
  await vercelAPI(
    run,
    `/v9/projects/${identifier(project.id)}`,
    team.id,
    {
      autoExposeSystemEnvs: true,
      ...(targets.includes("preview")
        ? { previewDeploymentsDisabled: false }
        : project.link
          ? {}
          : { previewDeploymentsDisabled: true }),
    },
    "PATCH"
  );
  if (project.link && !targets.includes("preview")) {
    ui.report(
      "Existing Preview deployment settings were preserved. Preview variables were not configured; review active Preview branches separately."
    );
  }
  ui.progress?.("system-environment");
  for (const variable of plan) {
    if (variable.existing) {
      // CLI update cannot distinguish the base Preview key from branch overrides.
      // Patch the inspected ID instead, preserving all other entries and targets.
      await vercelAPI(
        run,
        `/v10/projects/${identifier(project.id)}/env/${identifier(variable.existing.id)}`,
        team.id,
        {
          value: variable.value,
          type: variable.type === "secret" ? "sensitive" : "plain",
          visibility: variable.type,
        },
        "PATCH"
      );
    } else {
      await run({
        args: [
          "env",
          "add",
          variable.key,
          variable.target,
          "--project",
          project.id,
          "--scope",
          team.id,
          "--type",
          variable.type,
        ],
        input: variable.value,
      });
    }
    ui.progress?.(`variable:${variable.target}:${variable.key}`);
  }
  const saved = await remoteEnvironment(run, project, team);
  if (
    targets.some((target) =>
      requiredHostingKeys(local, target).some(
        (key) => !baseVariable(saved, key, target)
      )
    ) ||
    plan.some((variable) => {
      const entry = baseVariable(saved, variable.key, variable.target);
      return (
        !entry ||
        (variable.type === "secret" &&
          entry.type !== "sensitive" &&
          entry.visibility !== "secret")
      );
    })
  ) {
    throw new Error(
      "Vercel did not confirm all required variables and secret types. Git was not newly connected; rerun setup to inspect and complete the plan."
    );
  }
  assertSafeRemoteEnvironment(local, saved, targets);
  for (const key of [
    "NEXT_PUBLIC_SITE_URL",
    ...(local.admin ? ["BETTER_AUTH_URL"] : []),
  ]) {
    const variable = baseVariable(saved, key, "production");
    if (
      !variable ||
      (await configValue(run, project, team, variable)) !== origin
    ) {
      throw new Error(
        `Vercel did not confirm the production origin for ${key}. Git was not newly connected; inspect the variable and rerun setup.`
      );
    }
  }
  if (local.admin) {
    for (const target of targets) {
      authSecretPlan(saved, target);
    }
  }
  // Re-read immediately before connecting; never allow --yes to replace a link.
  const beforeConnect = await vercelAPI<Project>(
    run,
    `/v9/projects/${identifier(project.id)}`,
    team.id
  );
  assertProject(beforeConnect, team, project.id, remote);
  if (
    beforeConnect.framework !== "nextjs" ||
    beforeConnect.nodeVersion !== "24.x" ||
    (beforeConnect.rootDirectory ?? null) !== git.rootDirectory ||
    (beforeConnect.buildCommand ?? null) !== null ||
    (beforeConnect.installCommand ?? null) !== null ||
    (beforeConnect.outputDirectory ?? null) !== null ||
    beforeConnect.autoExposeSystemEnvs !== true ||
    (targets.includes("preview")
      ? beforeConnect.previewDeploymentsDisabled !== false
      : !project.link && beforeConnect.previewDeploymentsDisabled !== true)
  ) {
    throw new Error(
      "Vercel did not confirm the planned build and environment settings. Git was not newly connected; inspect the project and rerun setup."
    );
  }
  if (!beforeConnect.link) {
    const currentLink = await readLink(local.root);
    if (
      currentLink?.orgId !== team.id ||
      currentLink.projectId !== project.id
    ) {
      throw new Error(
        "The local Vercel link changed. Git was not connected; rerun setup."
      );
    }
    await run({
      args: [
        "git",
        "connect",
        remote.url,
        "--project",
        project.id,
        "--scope",
        team.id,
        "--yes",
      ],
    });
  }
  ui.progress?.("git-connected");
  // Official Vercel Terraform provider uses this endpoint; CLI has no branch setter.
  await vercelAPI(
    run,
    `/v9/projects/${identifier(project.id)}/branch`,
    team.id,
    { branch: "main" },
    "PATCH"
  );
  const final = await vercelAPI<Project>(
    run,
    `/v9/projects/${identifier(project.id)}`,
    team.id
  );
  assertProject(final, team, project.id, remote);
  if (!final.link || final.link.productionBranch !== "main") {
    throw new Error(
      "Vercel did not confirm main as the production branch. Check Settings → Environments → Production → Branch Tracking, then rerun setup. Completed configuration was retained."
    );
  }
  const emailPending = local.admin
    ? targets.filter((target) =>
        ["RESEND_API_KEY", "EMAIL_FROM"].some(
          (key) => !baseVariable(saved, key, target)
        )
      )
    : [];
  ui.report(
    `Configured ${team.slug}/${project.name}\n${remote.url} → main → Production\nEnvironments: ${targets.join(", ")}\nProduction origin: ${origin}\n${emailPending.length ? `Pending: password recovery email for ${emailPending.join(", ")}.\n` : ""}Saving variables does not update existing deployments. Your next push or merge to main triggers the Git deployment. Preview uses staging when configured. Review/publish local changes and apply reviewed migrations yourself; setup can be rerun after any partial failure.`
  );
  ui.progress?.("production-branch");
  return {
    team: team.id,
    project: project.id,
    name: project.name,
    origin,
    targets,
    emailPending,
  };
}
