# Security policy

## Supported code

Security fixes target the current `main` branch. Earlier snapshots do not have a separate maintenance commitment. Generated applications contain their own copies of starter code; updating the Dinvolt CLI does not patch an existing application. Review and apply relevant fixes in those applications and maintain their dependencies separately.

## Reporting a vulnerability

Use **Report a vulnerability** on the repository's [Security page](https://github.com/nicoandrade/dinvolt/security) when private reporting is available. Include the affected commit or version, the command or generated feature involved, a minimal reproduction and the impact you observed.

If private reporting is unavailable, open an issue asking for a private reporting channel without disclosing the vulnerability. Do not include exploit details, credentials, user data or database dumps in public issues or pull requests.

## Dependency advisories

Run `bun audit` from the repository root to inspect the current lockfile. The normal checks do not establish that dependencies are free of known vulnerabilities.

As of October 19, 2026, the lockfile includes `braces@3.0.3` through `micromatch` and `fast-glob`, used by shadcn and Ultracite tooling. [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) reports a stack exhaustion issue from deeply nested brace patterns, with no patched version currently listed. The audit remains visible; it is not suppressed. Avoid passing untrusted glob patterns to local tooling. This dependency finding alone does not establish an exploitable path in a generated application's server.
