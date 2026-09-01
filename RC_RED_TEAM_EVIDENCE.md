# Release Candidate Red-Team Evidence

The independent review pass was run after the RC implementation pass with
fresh source searches and `npm run release:red-team`.

## Automated checks

The release red-team script verifies:

- Workflow Core has no `NativeWorkflowStore` reference and no literal
  Host-specific branch for known external identities;
- model-facing Agent surface remains exactly five commands;
- signing key files are not tracked and remain ignored;
- all three Skill projections are byte-identical;
- the packaged CLI returns canonical output for `--help`;
- the desktop release workflow contains a release gate, draft-first publication,
  installer staging, checksums, SBOM and tag-only attestation permissions/actions;
- the retired manual release workflow cannot invoke the Tauri publishing action;
- the security workflow contains the secret audit, CodeQL and dependency review;
- support diagnostics source has no raw credential/header/token fields and
  reduces endpoints through the loopback-origin helper.

Observed result:

```json
{
  "ok": true,
  "failures": [],
  "observations": [
    "workflow-core-files=59",
    "agent-public-commands=5",
    "skill-projections=3",
    "local-signing-files-present=2"
  ]
}
```

The two local signing files are ignored test/developer material; neither is
tracked or used as production release evidence.

## Findings and disposition

- A first version of the check treated a `clientId` comparison in
  `workflowWorkspaceAdapter.ts` as Host-specific logic. The matcher was
  narrowed to known Host identity literals; the source was not changed because
  it was a valid writer-identity comparison, not a Core Host branch.
- No P0/P1 findings remain in this review pass.
- In-process Workflow Node Plugins remain trusted code rather than a security
  sandbox; this is documented in `THREAT_MODEL.md` and `RC_PLUGIN_EVIDENCE.md`,
  so third-party plugin isolation is not advertised as Stable.
- Production updater key custody, Authenticode, real Provider billing and real
  Codex/DSH login remain explicit external gates rather than hidden passes.

```text
npm run release:red-team
npx tsc --noEmit
git diff --check
```
