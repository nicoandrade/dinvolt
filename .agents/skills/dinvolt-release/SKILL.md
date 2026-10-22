---
name: dinvolt-release
description: Prepare and publish a Dinvolt CLI release end to end, including version and changelog, commit, push, GitHub release, and verified npm publication. Use when asked to release Dinvolt itself, not applications generated with Dinvolt.
---

# Dinvolt Release

Complete the release through verified npm availability. Invoking `$dinvolt-release` to release Dinvolt authorizes version/changelog edits, the release commit, push, and GitHub publication together; do not request separate confirmation at each stage. Respect narrower requests such as preparation only. Creating, editing, or discussing this skill does not invoke the release workflow.

This is an internal repository skill. Keep it under `.agents/skills/`; never add it to `catalog/skills/config.json`, the npm `files` allowlist, or generated projects.

## Establish the target

1. Locate the Dinvolt repository root. Read its `AGENTS.md`, [publishing guide](../../../docs/publishing.md), [workflow](../../../.github/workflows/publish.yml), and [release validator](../../../scripts/release.ts). Confirm the package is `dinvolt` and the release remote is `nicoandrade/dinvolt`; do not operate on a generated application or fork by mistake.
2. Inspect the branch, upstream, status, staged/unstaged changes, relevant untracked files, and committed work since the last release. Preserve unrelated work. Use the intended release branch (normally `main`); do not silently include unrelated commits or change branches over pending work.
3. Read GitHub releases/tags and npm's registry state before choosing or resuming a version. Check tool authentication and the required Node/Bun versions from the repository. Use capable connected tools or `gh` for GitHub operations.

## Prepare and validate

Apply [keep-a-changelog](../keep-a-changelog/SKILL.md). If that local installation is unavailable, read the repository's maintained copy at [skills/keep-a-changelog/SKILL.md](../../../skills/keep-a-changelog/SKILL.md).

- Honor an explicit target version. Otherwise select the appropriate SemVer bump from the actual changes. Reuse an already prepared unreleased version; a repeated invocation must not bump it twice. If a release is already published and there is no new release work, verify it instead of creating an empty release.
- `package.json` owns the CLI version. Inspect lock metadata rather than assuming it contains a root version. Preserve English changelog entries, `Unreleased`, comparison links, and the validator's unbracketed heading: `## VERSION - YYYY-MM-DD`, using the user's local release date.
- Validate that the tag is `vVERSION` and the prerelease flag matches the version. The exported `releaseMetadata` function in `scripts/release.ts` can validate these inputs locally; its CLI modes expect a real GitHub release event and CI output paths.
- Run `bun run check` on the final release content. Exercise affected generated application flows when needed, following the repository's database/test instructions. Reuse still-valid test evidence from this task; rerun checks affected by subsequent changes.
- Verify the npm package boundary with the included package check. Internal instructions, `.agents/`, demos, credentials, and docs application dependencies must remain excluded.

## Commit and push

Review the final diff and stage only release-scoped paths or hunks, including the implementation being released, its documentation, version, and changelog. Commit with a descriptive version-bearing message; skip a new commit if the correct release commit already exists.

Fetch the intended remote branch, check divergence, and push without force. Record the full tested commit SHA and verify the remote branch contains that exact release commit. If integrating upstream changes changes release content, validate it before pushing. Never publish from an unpushed or untested commit.

## Publish the GitHub release

Check the target tag, GitHub release, npm version, and any existing publishing run before mutation:

- If the tag already exists, resolve it to its commit and verify it equals the tested release SHA. Do not move a published tag.
- If a matching release/run exists, resume monitoring or verification. A draft can be published once its tag, target and notes are correct. Editing an already published release does not trigger npm publication.
- If npm already contains the version, do not republish or replace its contents. Verify the existing artifact and source provenance; report conflicting state instead of overwriting it.

Extract only the target version's changelog section to a temporary notes file. Publish a non-draft GitHub release pinned to the full tested, pushed SHA. For example, with shell variables populated from verified metadata:

```sh
gh release create "$release_tag" --repo nicoandrade/dinvolt \
  --target "$release_sha" --title "Dinvolt $release_version" \
  --notes-file "$release_notes_file" --latest
```

Use `--prerelease` instead of `--latest` for prerelease versions. Verify the published release flags and the remote tag's resolved commit, not just the release's target branch label.

## Verify npm publication

Publishing the GitHub release triggers `.github/workflows/publish.yml` through `release.published`. A push, tag, draft, or release edit alone does not. The workflow uses npm trusted publishing, packs and tests an archive, publishes that exact archive, and verifies registry integrity and the installed CLI. Stable releases use `latest`; prereleases use `next`.

1. Locate the `Publish npm release` run for the release event and exact SHA. Monitor it to completion with bounded waits and progress updates. Inspect failures with `gh run view RUN_ID --log-failed` or equivalent.
2. Require successful archive, publication, and verification steps. Independently read `dinvolt@VERSION` and the expected dist-tag from `https://registry.npmjs.org/`; both must identify the intended version. Use the workflow's successful integrity check as evidence that npm serves the tested archive.
3. From a temporary directory outside the checkout, run the exact registry version to avoid accidentally executing the local CLI:

   ```sh
   npm exec --yes --prefer-online --registry=https://registry.npmjs.org/ \
     --package="dinvolt@$release_version" -- dinvolt --version
   npm exec --yes --prefer-online --registry=https://registry.npmjs.org/ \
     --package="dinvolt@$release_version" -- dinvolt create --help
   ```

   Confirm the reported version equals the target and the help command succeeds.

Registry propagation can temporarily return `E404` or `ETARGET` after an accepted upload. Retry read-only verification for up to five minutes, with waits of at most 30 seconds; do not publish again to solve propagation. If still unavailable, report the exact incomplete verification.

On workflow failure, inspect whether npm accepted the upload before retrying anything. A transient failure before publication can justify one workflow retry with unchanged content. After an accepted upload, only verify the existing version; never rerun publication blindly. Source corrections after a published release require a new version/tag. Report persistent authentication, integrity, or workflow problems with the failing step and needed action; do not silently switch to manual npm publishing or change trusted-publisher settings.

## Report

Respond briefly in the user's language with the version, commit, links to the GitHub release and npm version, and validation/publication results. Distinguish pushed source, published GitHub release, workflow completion, and npm verification if any stage remains incomplete. Do not call the release complete based only on GitHub publication.
