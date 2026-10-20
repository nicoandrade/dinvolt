---
title: Agent skills
description: Use the recommended project skills or install Dinvolt's Keep a Changelog skill independently.
---

Dinvolt installs recommended skills by default. Advanced configuration lets you skip installation; non-interactive creation supports `--no-skills`.

## Skills in generated projects

The selection follows the chosen project type and database. Common skills cover React, interface guidelines, browser checks, shadcn, transitions and changelogs. Administration projects also receive authentication and provider-specific database skills.

Dinvolt copies skills into `.agents/skills/` for Codex, Cursor and compatible agents, and `.claude/skills/` for Claude Code. The generated `skills-lock.json` records sources and hashes. Commit those directories and the lockfile to share the same instructions with your team.

Review skill updates before applying them:

```sh
npx skills update
```

The current selection is maintained in [catalog/skills/config.json](https://github.com/nicoandrade/dinvolt/blob/main/catalog/skills/config.json). See the [CLI reference](/reference/cli#project-agent-skills) for installation details.

## Keep a Changelog

Dinvolt's portable `keep-a-changelog` skill works in any repository or stack. It reviews changes, chooses a semantic version and updates `CHANGELOG.md` or `CHANGELOG.txt`.

Install it independently:

```sh
npx skills add nicoandrade/dinvolt --skill keep-a-changelog
```

Then ask your agent:

```text
Use keep-a-changelog to review the changes, choose the next version and update the changelog.
```

You can also request only an `Unreleased` update or an explicit version. Preparing release files does not commit, publish or deploy them.

New Dinvolt projects receive the bundled skill when skill installation is enabled. Read its [source instructions](https://github.com/nicoandrade/dinvolt/blob/main/skills/keep-a-changelog/SKILL.md) and the [Skills CLI documentation](https://skills.sh/docs/cli) for more options.
