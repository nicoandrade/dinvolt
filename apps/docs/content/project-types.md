---
title: Project types
description: Choose a public website or a website with administration before creating your project.
---

Dinvolt asks about your product before configuring the stack. Select the project type that matches what you need to build.

| Capability | Public website only | Public website + administration |
| --- | --- | --- |
| Next.js, React and TypeScript | Included | Included |
| Public UI and branding | Included | Included |
| Agent instructions and recommended skills | Included | Included |
| Database with Drizzle | — | Turso or PlanetScale Postgres |
| Authentication with Better Auth | — | Included |
| Admin routes and user management | — | Included |
| tRPC and TanStack Query | — | Included |
| Password recovery | — | Requires Resend configuration |

## Public website only

Choose this for landing pages, portfolios, informational sites and other projects that do not need the generated administration features.

Dinvolt generates no database, authentication, administration routes or tRPC integration. UI commands target the public area by default.

## Public website + administration

Choose this when your application needs authenticated administration and persistent data. The wizard preselects this option, but you can change it.

The generated project includes a public site and an admin area with separate UI profiles. Database credentials and first-administrator creation can be deferred while you explore the static pages and anonymous login screen.

Use the [database](/guides/database), [authentication](/guides/authentication) and [API and data](/guides/data) guides when connecting and extending the application.

## Completing an existing project

The chosen type is recorded in `.dinvolt/config.json`. `dinvolt setup` completes the capabilities already installed; it does not turn a public-only project into an administration project or change its database provider.

Keep the generated metadata and helpers with your application. Read [setup behavior](/reference/cli#complete-an-existing-project) before reconfiguring an existing project.
