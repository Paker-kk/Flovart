# Release Security Automation Evidence

## Local checks

The release candidate now exposes:

```text
npm run release:secret-audit
```

The audit reads Git-tracked and non-ignored untracked files, skips binary files
and oversized artifacts, detects high-confidence
private-key/access-token/literal-bearer/API-key patterns, and redacts matched
previews. The current working tree result is:

```text
scanned: 910
findings: 0
exit: 0
```

`npm run release:red-team` also verifies the stable five-command Agent surface,
Skill projection parity, CLI `--help`, signing-key tracking rules and release
artifact markers.

## Hosted workflow

`.github/workflows/security.yml` provides:

- tracked secret audit on pushes, pull requests, scheduled runs and manual runs;
- CodeQL for JavaScript/TypeScript and Rust;
- high-severity dependency review on pull requests.

`.github/workflows/ci.yml` and the tag release gate run the local secret audit as
part of their required checks.

The tag path also calls the reusable security workflow before the desktop build;
the retired manual release workflow contains no publishing action. Desktop
artifacts stay in a draft until the complete build matrix and final integrity
steps succeed.

## Boundary

The repository workflow does not itself enable GitHub secret scanning, push
protection, branch rules, production signing-key custody or hosted workflow
approval. Those are repository-owner/release-operations gates and remain
explicitly pending until their settings and run evidence are available.
