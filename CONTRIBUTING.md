# Contributing to Dinvolt

Bug reports, documentation improvements and focused pull requests are welcome. For a substantial feature or a change to the generated stack, open an issue first to discuss the scope.

## Local setup

Use Node.js 24 or later, Git and the Bun version declared in `package.json`.

```sh
git clone https://github.com/nicoandrade/dinvolt.git
cd dinvolt
bun install --frozen-lockfile
bun run check
```

`bun run check` runs lint, formatting, TypeScript, the CLI and registry build, automated tests and the package contents check. It does not require database credentials. Run it locally before submitting a pull request.

To exercise a local CLI change, run `bun run dev --help` or rebuild with `bun run build` and run `node dist/cli.js --help`.

## Where changes belong

- `src/`: CLI commands and project assembly.
- `catalog/`: sources copied into generated applications, including their documentation and agent instructions.
- `playground/`: component and page previews. See the [playground guide](playground/README.md).
- `tests/`: CLI, generation and regression tests.
- `docs/`: command and hosting references.
- `apps/docs/`: the official Blume documentation site. See its [maintenance and deployment guide](apps/docs/README.md). Start it with `bun run docs:dev`; edit reused reference guides at their original source.

Keep generated project instructions applicable to the user's application. Repository tooling, internal test setup and maintainer instructions belong outside the catalog. Changes to catalog files affect future installations; existing applications own their installed source.

Preserve third-party notices and upstream provenance. See [third-party notices](THIRD_PARTY_NOTICES.md) before changing or adding vendored components, icons, fonts or images.

## Verification

Use `bun run fix` to apply formatting and safe lint fixes, then run `bun run check`. For a behavior change, add a focused regression test and exercise the affected command or generated application. Explain what was actually verified in the pull request.

UI changes should also be checked in the playground. Static navigation, headings, forms and table controls should render immediately; initial skeletons belong only to unresolved data. Keep existing content visible during background refreshes.

Real browser/database verification is optional for changes that do not affect those flows. The [E2E guide](scripts/e2e/README.md) describes the separate runner. Use a disposable test database you control; never use production credentials or commit local dotenv files, reports or generated demos.

The publication allowlist in `package.json` intentionally excludes repository tooling, tests, demos and private configuration. After building, `bun run check:package` verifies the npm file list without publishing or creating an archive.

## Issues and pull requests

For bugs, include the Dinvolt version or commit, OS, Node.js and package-manager versions, the exact command, expected behavior and a minimal reproduction. Redact credentials, personal data and private provider responses. Report suspected vulnerabilities using the [security policy](SECURITY.md).

Keep pull requests focused, update documentation when behavior changes and describe the relevant validation. Please communicate respectfully and review AI-assisted contributions before submitting them. Contributions to Dinvolt's own code are provided under the [MIT license](LICENSE); third-party assets retain their respective terms.

Record notable user-facing changes under `Unreleased` in [CHANGELOG.md](CHANGELOG.md), grouped by the applicable Keep a Changelog categories. At release time, move them into a dated version section; summarize behavior rather than copying commit messages.

Maintainers can follow the [npm publishing guide](docs/publishing.md). Publishing a GitHub release triggers npm publication; ordinary commits and pushes do not run the release workflow. A manual fallback is documented there as well.
