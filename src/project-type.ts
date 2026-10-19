export const projectTypes = [
  {
    value: "public-admin",
    label: "Public website + administration",
    hint: "Public website with an admin panel, sign-in and database",
  },
  {
    value: "public",
    label: "Public website only",
    hint: "A landing page or informational site, without admin, authentication or database",
  },
] as const;

export type ProjectType = (typeof projectTypes)[number]["value"];
export const defaultProjectType: ProjectType = "public-admin";

export function hasAdministration(type: ProjectType = defaultProjectType) {
  return type === "public-admin";
}

export function projectUITargets(type: ProjectType = defaultProjectType) {
  return hasAdministration(type)
    ? (["public", "admin"] as const)
    : (["public"] as const);
}
