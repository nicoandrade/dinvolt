export const projectTypes = [
  {
    value: "public-admin",
    label: "Public website + admin panel",
    hint: "Public website with an admin panel, sign-in and database",
  },
  {
    value: "public",
    label: "Public website only",
    hint: "A landing page or informational site, without an admin panel, authentication or database",
  },
  {
    value: "admin",
    label: "Admin panel only",
    hint: "Standalone admin app with sign-in and database, without a public website",
  },
] as const;

export type ProjectType = (typeof projectTypes)[number]["value"];
export const defaultProjectType: ProjectType = "public-admin";

export function hasAdministration(type: ProjectType = defaultProjectType) {
  return type !== "public";
}

export function projectUITargets(type: ProjectType = defaultProjectType) {
  if (type === "admin") {
    return ["admin"] as const;
  }
  return hasAdministration(type)
    ? (["public", "admin"] as const)
    : (["public"] as const);
}
