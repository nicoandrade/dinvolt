import { registryItemSchema } from "shadcn/schema";

// Adapt only known starter paths and route literals. Auth/API identifiers and
// /api/admin endpoints keep their existing meaning and authorization boundaries.
export function adminOnlySource(source: string): string {
  return (
    source
      .replaceAll(/^For \*\*Admin panel only\*\* projects,.*\n\n/gmu, "")
      .replaceAll('<html className="admin-panel"', "<html")
      .replaceAll(
        "src/app/(admin)/admin/(protected)/home",
        "src/app/(admin)/(protected)/dashboard"
      )
      .replaceAll("src/app/(admin)/admin/", "src/app/(admin)/")
      .replaceAll("components/admin/", "components/")
      .replaceAll('"@/components/admin"', '"@/components"')
      .replaceAll("hooks/admin", "hooks")
      .replaceAll(
        /(?<quote>["'`])\/admin\/home(?=[/"'`])/gu,
        "$<quote>/dashboard"
      )
      .replaceAll(/(?<quote>["'`])\/admin\//gu, "$<quote>/")
      .replaceAll(/(?<quote>["'`])\/admin(?=["'`])/gu, "$<quote>/")
      // Rewrite the generated CLI template, not this generator's own variables.
      // eslint-disable-next-line no-template-curly-in-string -- These are literal template source strings.
      .replaceAll("${url.origin}/admin", "${url.origin}/")
      .replaceAll("Open /admin on", "Open / on")
  );
}

function withoutPublicNavigation(path: string, content: string) {
  if (path === "admin-panel/auth/login-form.tsx") {
    return content
      .replaceAll(
        'import { BackButton } from "@/components/back-button";\n',
        ""
      )
      .replaceAll(
        /\s*<BackButton href="\/" variant="ghost">\s*Back to home\s*<\/BackButton>/gu,
        ""
      )
      .replaceAll(
        "-mt-2 flex items-center justify-between gap-2",
        "-mt-2 flex items-center justify-end gap-2"
      );
  }
  if (path === "admin-panel/shell/admin-shell.tsx") {
    return content
      .replaceAll(
        'import OpenExternal from "@/components/icons/outline/open-external";\n',
        ""
      )
      .replaceAll(
        /\s*<SidebarGroup className="mt-auto">[\s\S]*?<\/SidebarGroup>/gu,
        ""
      );
  }
  return content;
}

export function adminOnlyRegistryItem(
  item: ReturnType<typeof registryItemSchema.parse>
) {
  return registryItemSchema.parse({
    ...item,
    files: item.files
      ?.filter(
        (file) =>
          ![
            "~/src/components/admin/logo-iso.tsx",
            "~/src/components/admin/logo-complete.tsx",
          ].includes(file.target ?? "")
      )
      .map((file) => ({
        ...file,
        target: file.target ? adminOnlySource(file.target) : undefined,
        content: file.content
          ? adminOnlySource(withoutPublicNavigation(file.path, file.content))
          : file.content,
      })),
  });
}
