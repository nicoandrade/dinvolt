# Example project creation prompt

This is the editable English prompt intended for the landing page's **For agents** option. It asks an agent to create a Dinvolt starter, verify it locally and report pending setup. Its scope is the generated starter; deployment and custom application development require their own requests.

## Copyable prompt

```text
Create a new project with Dinvolt and get the generated starter running locally.

1. Inspect this conversation and the target directory first. Reuse requirements and preferences already provided. Ask only about unresolved product choices: the project name/location and whether it needs a public website only or a public website with an admin panel, authentication, and a database. Infer clear answers and group necessary initial questions together.

2. Run `npx --yes dinvolt@latest create --help` and check the required Node.js version and package manager. Honor my chosen manager; otherwise use Dinvolt's detected/default manager when available, falling back to npm if Bun is unavailable. Pass that choice explicitly rather than installing a manager.

3. Use Dinvolt defaults for other unspecified technical options and keep recommended skills enabled. Do not walk me through the full wizard.

4. Create with non-interactive flags and `--json`, explicitly supplying `--name`, `--project-type`, an absolute `--cwd`, and `--location`. `--cwd` must exist; `current` uses that empty directory and `new` creates its named child. Preserve existing files. If the requested destination is occupied or already contains an app, resolve the conflict with me before creating or reconfiguring anything.

5. Leave database connections and administrator creation pending unless I explicitly requested them and supplied credentials for this project/environment. Keep secrets out of commands, logs, and version control; do not reuse another project's credentials. Missing credentials should not block generating or checking static pages.

6. Inspect the exit code and JSON status, including `project.path` and per-environment results. Deliberately deferred setup may report `needs-attention`. If a project already exists after a partial failure, inspect it and continue with the appropriate setup command instead of rerunning create blindly.

7. Read the generated AGENTS.md and documentation. Run its lint, TypeScript, and build checks, start its documented development command, and verify the public page and, if included, the anonymous admin login in a browser when available. Use the URL reported by the app. Do not claim authentication or database flows work unless actually tested.

8. Report the project path, configuration, local URL, verification results, and pending steps, including how to complete database/admin setup with `dinvolt setup` if needed. State any check you could not run.
```

## Maintaining the example

Keep the copyable prompt in English and update this file when Dinvolt's commands, defaults or capabilities change. Check the published CLI's help and the [CLI reference](cli.md) before adding instructions: local features may not yet be available through `@latest`. Keep the landing page's copied text aligned with the reviewed prompt when integrating or updating it.

Preserve the approach of asking only unresolved product questions, using technical defaults and inspecting structured results before retrying. When revising the prompt, exercise public-only creation and creation with an admin panel, plus ambiguous requirements, an occupied destination, an unavailable default package manager and an existing project. Record actual application checks separately from reasoning reviews.

## Verification baseline — 2026-10-20

- Published Dinvolt `0.2.1`: public-only creation with npm, default design and recommended skills passed lint, TypeScript, production build and desktop/mobile browser checks.
- Local Dinvolt `0.2.2`: creation with an admin panel, Bun and recommended skills passed lint, TypeScript, production build, public page and anonymous admin login checks. Database connections and administrator creation were intentionally deferred; authentication and database reads/writes were not tested.
- A separate agent reviewed four decision scenarios: missing product requirements, an occupied directory, Bun unavailable with npm available, and an existing Dinvolt project. A second reasoning review found the revised prompt covered those ambiguities. These reviews were not additional application runs.

The initial admin attempt used a nonexistent `--cwd` and failed before generation. Creating the empty target directory and retrying succeeded. This is why the prompt explicitly distinguishes the existing `--cwd` directory from the `current`/`new` location choice.
