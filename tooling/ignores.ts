// Keep demos independent and preserve vendored sources and their content hashes.
// Own catalog components, including icons and registry blocks, remain checked.
export const repositoryIgnores = [
  "demos/**",
  "planes/**",
  "apps/docs/.blume/**",
  "apps/docs/.blume-verify/**",
  "apps/docs/.astro/**",
  "apps/docs/.vercel/**",
  ".agents/skills/**",
  ".claude/skills/**",
  "catalog/ui/components/admin/**",
  "catalog/ui/components/public/**",
  "playground/showcase/**",
  "playground/component-examples/**",
  "!catalog/ui/components/admin/ui/radio-group-inline.tsx",
  "!catalog/ui/components/admin/ui/radio-group-cards.tsx",
  "!catalog/ui/components/public/ui/radio-group-inline.tsx",
  "!catalog/ui/components/public/ui/radio-group-cards.tsx",
  "!playground/component-examples/radio-group-inline-example.tsx",
  "!playground/component-examples/radio-group-cards-example.tsx",
];
