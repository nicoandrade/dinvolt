import { randomBytes } from "node:crypto";

import {
  connectionFields,
  credentialError,
  databaseVariableName,
} from "./database-connections.ts";
import { effectiveEnvironment } from "./private-environment.ts";
import { projectDatabase } from "./project-configuration.ts";
import type { ExistingProject } from "./project-configuration.ts";

export type HostingTarget = "production" | "preview";
export interface RemoteVariable {
  id: string;
  key: string;
  target: string[] | string;
  gitBranch?: string | null;
  customEnvironmentIds?: string[];
  type?: string;
  visibility?: "config" | "secret";
  decrypted?: boolean;
  updatedAt?: number;
  value?: string;
}
export interface PlannedVariable {
  key: string;
  target: HostingTarget;
  type: "secret" | "config";
  value: string;
  existing?: RemoteVariable;
}
export function requiredHostingKeys(
  project: ExistingProject,
  target: HostingTarget
) {
  return [
    ...(target === "production"
      ? ["NEXT_PUBLIC_SITE_URL", ...(project.admin ? ["BETTER_AUTH_URL"] : [])]
      : []),
    ...(project.admin
      ? [
          "BETTER_AUTH_SECRET",
          ...connectionFields(projectDatabase(project).provider).map(
            ({ name }) =>
              databaseVariableName(
                name,
                target === "preview" ? "staging" : "production"
              )
          ),
        ]
      : []),
  ];
}
export function baseVariable(
  variables: RemoteVariable[],
  key: string,
  target: HostingTarget
) {
  const matches = variables.filter(
    (variable) =>
      variable.key === key &&
      !variable.gitBranch &&
      [variable.target].flat().includes(target)
  );
  if (matches.length > 1) {
    throw new Error(
      `Multiple base definitions for ${key} (${target}); reconcile them in Vercel before setup.`
    );
  }
  return matches[0];
}
export function assertSafeRemoteEnvironment(
  project: ExistingProject,
  variables: RemoteVariable[],
  targets: HostingTarget[]
) {
  for (const variable of variables) {
    if (!targets.some((target) => [variable.target].flat().includes(target))) {
      continue;
    }
    if (
      variable.key === "DINVOLT_DATABASE_ENV" ||
      variable.key.startsWith("DEV_ADMIN_") ||
      [
        "VERCEL_TOKEN",
        "VERCEL_ENV",
        "VERCEL_URL",
        "NEXT_PUBLIC_VERCEL_ENV",
        "NEXT_PUBLIC_VERCEL_URL",
      ].includes(variable.key)
    ) {
      throw new Error(
        `${variable.key} already exists in a hosting target (possibly a branch override). Review/remove it explicitly in Vercel, then retry; setup will not change its destination or expose its value.`
      );
    }
    if (
      project.admin &&
      /^(?:TURSO_DATABASE_URL|TURSO_AUTH_TOKEN|DATABASE_URL|DATABASE_URL_DIRECT)(?:_|$)/u.test(
        variable.key
      )
    ) {
      const allowed = targets
        .filter((target) => [variable.target].flat().includes(target))
        .every((target) =>
          connectionFields(projectDatabase(project).provider).some(
            ({ name }) =>
              variable.key ===
              databaseVariableName(
                name,
                target === "preview" ? "staging" : "production"
              )
          )
        );
      if (!allowed) {
        throw new Error(
          `Unexpected database key ${variable.key} in a hosting target. Review it explicitly in Vercel before setup.`
        );
      }
    }
  }
}
export async function databaseHostingValues(
  project: ExistingProject,
  target: HostingTarget
) {
  if (!project.admin) {
    return [];
  }
  const environment = target === "preview" ? "staging" : "production";
  const db = projectDatabase(project);
  if (!db.environments.includes(environment)) {
    throw new Error(
      `Prepare ${environment} with dinvolt setup before configuring hosting.`
    );
  }
  const fields = connectionFields(db.provider);
  const keys = fields.map(({ name }) =>
    databaseVariableName(name, environment)
  );
  const values = await effectiveEnvironment(project.root, environment, keys);
  return fields.map(({ name }) => {
    const key = databaseVariableName(name, environment);
    const value = values[key];
    if (!value || credentialError(name, value)) {
      throw new Error(
        `Missing or invalid ${key}. Complete ${environment} with dinvolt setup; hosting setup does not query or migrate databases.`
      );
    }
    return { key, target, type: "secret" as const, value };
  });
}
export function authSecretPlan(
  variables: RemoteVariable[],
  target: HostingTarget
): PlannedVariable[] {
  // Presence is authoritative. Secret values are deliberately not readable.
  const existing = baseVariable(variables, "BETTER_AUTH_SECRET", target);
  if (existing) {
    if (
      [existing.target].flat().length !== 1 ||
      existing.customEnvironmentIds?.length
    ) {
      throw new Error(
        "BETTER_AUTH_SECRET is shared across environments. Create separate remote secrets explicitly in Vercel before setup; it was not rotated."
      );
    }
    return [];
  }
  return [
    {
      key: "BETTER_AUTH_SECRET",
      target,
      type: "secret",
      value: randomBytes(32).toString("base64url"),
    },
  ];
}
export function originError(value: string) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      !url.hostname.includes(".")
    ) {
      throw new Error("Invalid origin.");
    }
  } catch {
    return "Enter a public HTTPS origin without path, credentials, query or port.";
  }
}
