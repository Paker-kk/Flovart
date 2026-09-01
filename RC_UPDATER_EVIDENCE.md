# Release Candidate Updater Evidence

## Configuration

- `src-tauri/tauri.conf.json` enables the Windows NSIS bundle and
  `createUpdaterArtifacts: true`.
- The production updater endpoint is the versioned GitHub `latest.json`
  endpoint already declared in the Tauri config.
- `src-tauri/tauri.local.conf.json` deliberately sets
  `createUpdaterArtifacts: false` for local development builds so a developer
  build cannot be mistaken for a signed release channel.
- No repository private signing key was read or used. The RC used a fresh
  test-only key under `C:\tmp`; its public key was supplied through a temporary
  Tauri config overlay and its private value only through a child-process
  environment variable.

## Signed test build

The first signing attempt intentionally omitted the private-key content. Tauri
failed closed with:

```text
A public key has been found, but no private key.
```

With the isolated test key, the real command completed:

```text
npx tauri build --ci --config C:\tmp\flovart-rc13-tauri.conf.json --bundles nsis
```

Observed artifacts:

```text
Flovart_0.3.2_x64-setup.exe       12,249,543 bytes
SHA-256                           962D27A1B44FC0F56B82EBA47345B8F1A62F0BAA836FE22476CF634F815D74A9
Flovart_0.3.2_x64-setup.exe.sig   416 bytes
Signature SHA-256                 980021B6681F62090158DCD9A573C96530AB0CDB889E73CE96CD7A4BD8D9DD24
```

The installer is not Authenticode-signed in this local RC run. Windows code
signing remains a production release gate.

## Signature rejection

The Tauri-generated public/signature envelopes were decoded and verified with
the same `minisign-verify` family used by the updater dependency:

```text
{"artifactBytes":12249543,"validSignature":true,"tamperedArtifactRejected":true}
```

The check verifies the complete installer bytes, flips one byte in an isolated
copy, and confirms that the original signature is rejected. This is a
transport-level signature proof; a full installed N → N+1 updater launch still
requires a signed release host and a desktop runtime session.

The final signed-test package also passed the isolated NSIS install, launch,
graceful-close, and uninstall smoke recorded in `RC_INSTALLER_EVIDENCE.md`.

## External release gates

- Production updater private key and password must be supplied through the
  release secret store, never committed.
- The configured production public key must be checked against the release key
  owner before publishing `latest.json`.
- Real N → N+1 install/restart and invalid-update rejection should be run once
  on a disposable Windows release machine with the production-equivalent
  signed artifacts.

## Hosted release pipeline hardening

`.github/workflows/build-desktop.yml` now runs the tag release gate and reusable
security gate before building. It creates a draft first, stages only bundle
installers under `dist/release-artifacts/installers`, emits `SHA256SUMS.txt`,
generates a platform-specific SPDX JSON SBOM with
`anchore/sbom-action@v0`, and runs `actions/attest@v4` with the SBOM on tagged
releases. A separate finalizer makes the draft public only after every matrix
platform and integrity step succeeds. The attestation step is tag-only and
requires GitHub `id-token` / `attestations` permissions; local development
builds do not need those permissions or production secrets.
