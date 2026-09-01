# Release Candidate CI Evidence

## Local critical stability

The repository now exposes `npm run test:critical`, which runs the bounded
release-critical suite without shell-specific `npx` shims. It includes
migration, Browser/Agent session, bootstrap, Fake Provider resilience, Runtime
credential boundary, Skill package validation, and offline shell tests.

Observed local run:

```text
node scripts/run-critical-suite.mjs
Critical suite green: 10/10 (45.0s)
9 test files and 48 tests passed on every repetition
```

## CI contract

`.github/workflows/ci.yml` runs docs contract, release red-team invariants,
tracked secret audit, typecheck, full Vitest, Web/extension/DSH builds, Rust
tests, and diff hygiene. Its separate `critical-stability` job runs the same
critical suite ten times.

The desktop workflow runs a tag-only release gate, calls the reusable hosted
security workflow, stages installers, emits SHA256 checksums, generates SPDX
JSON with Anchore Syft, and creates tag-only GitHub artifact attestations.
Artifacts remain a draft until the build matrix and integrity steps complete.
These hosted steps remain dependent on GitHub permissions and release secrets
and are not claimed as locally executed hosted attestations.

## Environment note

The current developer `node_modules` tree contains peer-version drift that
makes `npm sbom --package-lock-only` reject the installed tree because of
existing Radix/React peer declarations. The release workflow does not use that
command; it uses the pinned project scan action. A clean `npm ci` runner remains
the authoritative hosted check for dependency installation.
