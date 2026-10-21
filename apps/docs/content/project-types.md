---
title: Project types
description: Choose the foundation that matches your application.
---

Choose your project type in the creation wizard. All three options include Next.js, React, TypeScript, Tailwind CSS, shadcn/ui and recommended agent skills.

## Which one should I choose?

| Choose | When you need |
| --- | --- |
| **Public website only** | A landing page, portfolio or informational website. |
| **Public website + admin panel** | An authenticated admin area alongside a public site. |
| **Admin panel only** | A standalone authenticated app with marketing in a separate project. |

The wizard preselects **Public website + admin panel**. Choose **Public website only** for a marketing site, or **Admin panel only** for a standalone internal app.

## Public website only

You get a public application with editable UI and project instructions for your coding agent.

Database, authentication, admin routes and tRPC are not installed. UI commands target the public area by default.

Continue with [next steps for public websites](/next-steps#public-website-only), then [add components](/ui/blocks).

<span id="public-website--administration"></span>

## Public website + admin panel

You get the public application plus:

- **Better Auth:** email/password sign-in and administrator access.
- **Admin panel:** protected navigation, user management and CSV export.
- **Database:** Drizzle with Turso or PlanetScale Postgres.
- **API and data:** tRPC and TanStack Query.
- **Password recovery:** available after configuring Resend and a sender.

The public site and admin area have separate UI profiles. You can defer database credentials and first-administrator creation while exploring the public page and login screen.

Continue with [next steps for websites with a panel](/next-steps#public-website-with-an-admin-panel).

## Admin panel only

Use `--project-type admin`, or select **Admin panel only** in the wizard. This includes the same authentication, database, user management and API as the combined project, without generating a public website.

- Login at `/`; authenticated administrators go to `/dashboard`.
- Protected pages at `/users`, `/users/[userId]`, `/settings` and `/settings/preferences`.
- Password recovery at `/forgot-password` and `/reset-password`.
- One shadcn/ui preset and theme, with components in `src/components/ui` and hooks in `src/hooks`.
- `dinvolt ui add` defaults to the admin profile; `--target admin` also works. There is no public profile.

For example, deploy your app at `app.example.com` and manage `example.com` in a separate marketing project. Configure the app's own origin for authentication; the projects do not automatically share sessions or data.

Continue with [next steps for standalone apps](/next-steps#admin-panel-only).

## Complete setup later

Run setup inside the generated project when you have your service credentials:

```sh
npx dinvolt setup
```

Setup completes the capabilities already installed. It does not add an admin panel to a public-only project or switch database providers.

The selected type is stored in `.dinvolt/config.json`. Keep that file and the generated helpers with your application. See [setup options](/reference/setup).
