---
title: Build with agents
description: Give your coding agent a working project, clear conventions and explicit CLI results.
---

Dinvolt works with Codex, Claude Code, Cursor and other coding agents. The generated application provides project instructions, integration guides and recommended skills so the agent can build on the existing foundation.

## Ask your agent to create the project

Use the [copyable project creation prompt](/agents/project-prompt). It asks your agent to resolve product choices, inspect the published CLI, create without a wizard and verify the generated starter locally.

Deployment and custom feature development remain separate requests. Pending database credentials do not prevent creating the project or checking its static public page.

## Work inside an existing project

Ask your agent to read `AGENTS.md`, the README and the relevant generated integration guides before changing code. Those files describe the actual installed project, which may differ from the newest Dinvolt catalog.

Keep the application’s existing components, authorization boundaries and data conventions. Catalog updates do not automatically migrate installed application source.

## Use explicit command results

All four CLI commands support `--json` and `--no-input`. JSON mode disables prompts, writes one result to stdout and sends progress to stderr.

```sh
npx dinvolt setup --status --json
npx dinvolt ui add dialog textarea --target public --json
```

The first command inspects setup without changing it. The second installs components into the public UI area.

Have the agent inspect the exit code, `status`, `project.path`, `completedSteps` and pending steps. A partial failure may leave a valid project or completed remote operations; inspect those results before retrying.

See [non-interactive creation](/reference/cli#non-interactive-creation) and [agent execution for existing projects](/reference/cli#agent-execution-for-existing-projects) for the full contracts.

## Verify what actually works

Lint, TypeScript and a production build verify different things from browser, authentication or database checks. Have the agent report which flows it exercised and which remain pending.

Read [agent skills](/agents/skills) to see what Dinvolt installs and how to maintain them.
