# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

[Compare unreleased changes](https://github.com/nicoandrade/dinvolt/compare/v0.4.0...HEAD)

## 0.4.0 - 2026-10-22

[Compare changes](https://github.com/nicoandrade/dinvolt/compare/v0.3.1...v0.4.0)

### Added

- Bundled `project-documentation` skill for a short product interview in the user's language and concise Markdown context linked from README and AGENTS.md. Generated agent instructions offer onboarding when product context is missing and retire the suggestion once documented or declined.

### Fixed

- Generated authenticated apps redirect visitors without a session cookie before rendering and validate administrator access before showing the panel or its skeletons. Public website + admin projects protect `/admin/*` and redirect to `/admin`; standalone admin projects protect `/dashboard`, `/users` and `/settings`, including subroutes, and redirect to `/`. Sign-in, password recovery and social images remain public, and public-only projects receive no authentication proxy.
- Protected admin pages skip instant-navigation validation when a session redirect prevents rendering, avoiding development warnings while retaining Cache Components and streaming.

## 0.3.1 - 2026-10-22

[Compare changes](https://github.com/nicoandrade/dinvolt/compare/v0.3.0...v0.3.1)

### Changed

- Documentation separates the next steps, sign-in routes and UI profiles for all three project types, including standalone admin applications.

### Fixed

- Generated PlanetScale PostgreSQL initialization recognizes provider-owned extension views instead of treating an otherwise empty database as incompatible and blocking administrator setup.
- Generated PostgreSQL initialization connects through PgBouncer without unsupported timeout startup parameters, while retaining query timeouts and transaction-scoped migration limits.
- Interactive `setup` explains database initialization blockers before returning to the menu, instead of silently skipping administrator creation.
- Interactive `setup` preselects the environment when only one is available, so Enter can confirm it without first pressing Space. Multiple environments still require an explicit selection.

## 0.3.0 - 2026-10-21

[Compare changes](https://github.com/nicoandrade/dinvolt/compare/v0.2.3...v0.3.0)

### Added

- **Admin panel only** project type in the creation wizard and `--project-type admin`: a standalone authenticated app with login at `/`, protected home at `/dashboard`, user management and database setup. It uses one shadcn/ui preset and theme, with components in `src/components/ui`, and leaves marketing pages to a separate project.

### Changed

- Project guides, generated instructions and the agent creation prompt cover all three project types and their routes, UI profiles and deferred setup.

### Fixed

- UI additions install missing components while preserving existing dependencies instead of silently cancelling on an overwrite prompt. Explicit `--overwrite` continues to replace official components.
- Admin back navigation and compact user search work with custom shadcn/ui presets without requiring Dinvolt-specific primitive props. Remote preset components receive the same numeric field-validation correction as the bundled catalog.

## 0.2.3 - 2026-10-20

[Compare changes](https://github.com/nicoandrade/dinvolt/compare/v0.2.2...v0.2.3)

### Fixed

- Generated public welcome and admin authentication pages use lighter 1440 px background images, high fetch priority and inline blur previews, reducing initial downloads and displaying a preview while the full image loads.

## 0.2.2 - 2026-10-20

[Compare changes](https://github.com/nicoandrade/dinvolt/compare/v0.2.1...v0.2.2)

### Added

- Official Blume documentation site for `docs.dinvolt.com`, with getting-started and agent guides, shared CLI/integration references, local search and Markdown exports for agents.
- Copyable project creation prompt for coding agents, with explicit project choices, non-interactive creation, local verification and pending database/admin setup guidance.
- Next steps guide for public websites and apps with an admin panel, covering database connection and first-administrator setup. Generated welcome pages link directly to it.

### Changed

- Documentation provides npm, Bun, pnpm and Yarn command tabs, including matching project package-manager flags and script argument forwarding. Generated database, authentication and registry guides expose setup commands as runnable shell examples.
- Documentation and the main README use shorter task-based sections, copyable code examples and links to focused guides.
- Project choices and guides use **Public website + admin panel** across the CLI, documentation and generated projects. Existing project identifiers, command options and documentation links remain compatible.

### Fixed

- Generated VS Code workspaces select the chosen formatter, enable whole-file formatting on save and recommend its extension. Application UI components, hooks and utilities are included in linting and formatting, with focused Oxlint compatibility rules for primitive definitions.
- Prerendered public and admin Open Graph images use one year of immutable caching with URLs versioned by their title, logo, renderer and local font, avoiding repeated revalidation while allowing updated previews after a rebuild.
- Email headers use the versioned Apple icon URL so application logos remain reachable after icon caching was introduced.
- Public home backgrounds use static image imports with content-versioned URLs and long-lived immutable caching in both starter project types.
- Anonymous tRPC session checks skip authentication and database initialization when no session cookie is present, while retaining Better Auth validation for present cookies and request-scoped session deduplication.

## 0.2.1 - 2026-10-20

[Compare changes](https://github.com/nicoandrade/dinvolt/compare/v0.2.0...v0.2.1)

### Fixed

- New projects give prerendered browser and Apple touch icons one year of immutable caching, avoiding repeated browser revalidation. Icon URLs change automatically when the logo or image renderer source changes, so rebuilt applications display updated branding. Development keeps icon caching disabled.

## 0.2.0 - 2026-10-20

[Compare changes](https://github.com/nicoandrade/dinvolt/compare/v0.1.1...v0.2.0)

### Added

- Portable Keep a Changelog skill to choose semantic versions, synchronize version files and maintain Markdown or text changelogs in any project. New Dinvolt projects include the bundled skill when skill installation is enabled; it can also be installed independently through the Skills CLI.

### Changed

- Generated admin instructions clarify resource list layouts, accessible row navigation, form containers and when to use detail or editing pages.

### Fixed

- Release verification refreshes npm metadata and retries temporarily unavailable versions while the published package propagates through the registry.

## 0.1.1 - 2026-10-19

### Added

- npm publication from published GitHub releases, with matching version/tag checks, package creation tests and registry integrity verification. Ordinary commits and pushes do not trigger publication.

## 0.1.0 - 2026-10-19

Initial version of the Dinvolt CLI and application catalog.

### Added

- Public npm package with `npx dinvolt create` and optional global installation.
- Interactive and non-interactive CLI commands to create Next.js public websites or applications with administration.
- Editable public and admin UI profiles, shared action components and a local component playground.
- Optional Drizzle integration with Turso or PlanetScale Postgres, environment-specific database setup and guarded initial migrations.
- Better Auth sign-in, password recovery, administrator setup, user management and filtered CSV exports.
- tRPC and TanStack Query integration with server authorization, validated inputs and URL-based table state.
- Vercel environment and Git integration setup, with deployments following the application's Git workflow.
- Generated project documentation, AI agent instructions and optional curated skills.
- Local lint, formatting, type, build, automated test and package contents checks, plus a separate browser/Turso E2E runner.
- MIT licensing for Dinvolt's own code, preserved third-party notices, contribution guidelines and a security policy.
