# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

[Compare unreleased changes](https://github.com/nicoandrade/dinvolt/compare/v0.2.0...HEAD)

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
