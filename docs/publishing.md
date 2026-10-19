# Publishing Dinvolt to npm

Publishing a GitHub release runs [the npm publishing workflow](../.github/workflows/publish.yml). Ordinary commits, pushes, tag creation, draft releases and release edits do not trigger publication. Stable versions publish under npm's `latest` tag; GitHub prereleases use `next` and require a prerelease version such as `0.2.0-beta.1`.

The workflow uses npm trusted publishing (OIDC), without an npm token stored in GitHub. It checks out the release commit, validates the version and changelog, runs `bun run check`, packs and tests the archive by creating a public project, publishes that exact archive, then checks its registry integrity and installed CLI. These checks do not use internal database credentials; exercise affected database/authentication flows locally before releasing.

## One-time npm connection

In the npm package's Settings, add a GitHub Actions trusted publisher with these values:

- Organization or user: `nicoandrade`
- Repository: `dinvolt`
- Workflow filename: `publish.yml`
- Environment: leave empty
- Allowed actions: enable direct `npm publish` so a GitHub release does not need another npm approval.

An owner can also configure this with `npm trust github dinvolt --repository nicoandrade/dinvolt --file publish.yml --allow-publish`, completing npm's authentication prompt. Do not create a duplicate connection if one already exists.

npm currently requires a new trusted publisher to complete its first successful publication within two days. If it expires before the next release, recreate the connection before publishing. See [npm's trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/).

## Publish a GitHub release

1. Update `package.json` and move the upcoming changes from `Unreleased` in `CHANGELOG.md` into a dated version section. For example, version `0.1.1` needs `## 0.1.1 - YYYY-MM-DD`.
2. Run the local checks and exercise the affected generated application flows. Commit and push the release source, documentation and changelog together.
3. On GitHub, create and publish a release with the matching tag, such as `v0.1.1`, pointing to that commit. The tagged commit must contain the publishing workflow. For a prerelease, use a version such as `0.2.0-beta.1`, tag `v0.2.0-beta.1`, and select GitHub's prerelease option.
4. Watch the `Publish npm release` run in GitHub Actions. Success means the tested archive was published and its registry integrity and CLI were verified. npm may take a few minutes to make an accepted upload available.

Version mismatches or failed checks stop the workflow before publication. A GitHub release already exists when the workflow runs: a failed run does not remove that release or roll back npm. Inspect the failure and registry state before retrying. If npm has already accepted the version, do not try to replace its contents; verify that version or prepare a new one. A corrected commit needs a new release tag/version rather than silently moving an existing release tag.

## Manual fallback

Use Node.js 24+, npm, Git and the Bun version declared in `package.json`. An npm account with package publishing permission and the required two-factor authentication is needed. Use this path when GitHub publishing is unavailable; avoid publishing the same version both manually and through a new GitHub release.

### Prepare the version

Update `package.json` and `CHANGELOG.md` together. Keep upcoming changes under `Unreleased`, then move them into a dated version entry when preparing a release. A published name/version cannot be reused.

```sh
bun install --frozen-lockfile
bun run check
```

The checks build the Node.js CLI and registry and verify the package allowlist. Root instructions, test credentials, demos, repository tooling and tests must remain excluded. Keep the bundled catalog, runtime dependencies and license notices.

### Inspect and exercise the archive

```sh
npm pack --json
```

This runs `prepack` to rebuild the distribution and creates `dinvolt-<version>.tgz`. Inspect its file list and test that exact archive from an empty directory outside the checkout:

```sh
npx --yes --package /absolute/path/dinvolt-<version>.tgz dinvolt --help
npx --yes --package /absolute/path/dinvolt-<version>.tgz dinvolt create \
  --name package-smoke --location new --project-type public \
  --package-manager npm --no-skills --json
```

Exercise the generated application and relevant packaged blocks. An archive that starts successfully has not necessarily verified project creation or database/authentication flows.

### Publish the verified archive

```sh
npm login --registry=https://registry.npmjs.org/
npm publish /absolute/path/dinvolt-<version>.tgz --access public --ignore-scripts
```

Using the verified archive preserves the exact bytes that were tested. `--ignore-scripts` avoids lifecycle execution at this final step; run the checks and packing steps above first. Complete npm's authentication or 2FA prompt when required. Publishing from the source directory instead runs `prepublishOnly`, which requires Bun and the repository's development dependencies.

### Verify the release

```sh
npm view dinvolt version dist-tags dist.integrity --registry=https://registry.npmjs.org/
npx --yes dinvolt@<version> --version
npx --yes dinvolt@<version> create --help
```

Confirm the registry integrity matches the packed archive, and verify the registry-installed CLI from outside the checkout. Commit and push the matching source, documentation and changelog so GitHub and npm describe the same version.
