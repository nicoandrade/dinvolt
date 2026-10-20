---
title: Project types
description: Choose the foundation that matches your application.
---

Choose your project type in the creation wizard. Both options include Next.js, React, TypeScript, Tailwind CSS, shadcn/ui and recommended agent skills.

## Which one should I choose?

| Choose | When you need |
| --- | --- |
| **Public website only** | A landing page, portfolio or informational website. |
| **Public website + admin panel** | An authenticated admin area, user management and persistent data. |

The wizard preselects **Public website + admin panel**. Change it if your project only needs public pages.

## Public website only

You get a public application with editable UI and project instructions for your coding agent.

Database, authentication, admin routes and tRPC are not installed. UI commands target the public area by default.

Start with the [quickstart](/quickstart), then [add components](/ui/blocks).

<span id="public-website--administration"></span>

## Public website + admin panel

You get the public application plus:

- **Better Auth:** email/password sign-in and administrator access.
- **Admin panel:** protected navigation, user management and CSV export.
- **Database:** Drizzle with Turso or PlanetScale Postgres.
- **API and data:** tRPC and TanStack Query.
- **Password recovery:** available after configuring Resend and a sender.

The public site and admin area have separate UI profiles. You can defer database credentials and first-administrator creation while exploring the public page and login screen.

Continue with [database setup](/guides/database), [authentication](/guides/authentication) or the [admin panel](/ui/admin-panel).

## Complete setup later

Run setup inside the generated project when you have your service credentials:

```sh
npx dinvolt setup
```

Setup completes the capabilities already installed. It does not add an admin panel to a public-only project or switch database providers.

The selected type is stored in `.dinvolt/config.json`. Keep that file and the generated helpers with your application. See [setup options](/reference/setup).
