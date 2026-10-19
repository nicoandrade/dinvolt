# Publishing Dinvolt to npm

Releases are published manually from a maintainer's machine. Use Node.js 24+, npm, Git and the Bun version declared in `package.json`. An npm account with package publishing permission and the required two-factor authentication is needed.

## Prepare the version

Update `package.json` and `CHANGELOG.md` together. Keep upcoming changes under `Unreleased`, then move them into a dated version entry when preparing a release. A published name/version cannot be reused.

```sh
bun install --frozen-lockfile
bun run check
```

The checks build the Node.js CLI and registry and verify the package allowlist. Root instructions, test credentials, demos, repository tooling and tests must remain excluded. Keep the bundled catalog, runtime dependencies and license notices.

## Inspect and exercise the archive

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

## Publish the verified archive

```sh
npm login --registry=https://registry.npmjs.org/
npm publish /absolute/path/dinvolt-<version>.tgz --access public --ignore-scripts
```

Using the verified archive preserves the exact bytes that were tested. `--ignore-scripts` avoids lifecycle execution at this final step; run the checks and packing steps above first. Complete npm's authentication or 2FA prompt when required. Publishing from the source directory instead runs `prepublishOnly`, which requires Bun and the repository's development dependencies.

## Verify the release

```sh
npm view dinvolt version dist-tags dist.integrity --registry=https://registry.npmjs.org/
npx --yes dinvolt@<version> --version
npx --yes dinvolt@<version> create --help
```

Confirm the registry integrity matches the packed archive, and verify the registry-installed CLI from outside the checkout. Commit and push the matching source, documentation and changelog so GitHub and npm describe the same version.
