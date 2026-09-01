# Release Candidate Windows Installer Evidence

## Build

- Command: `npx tauri build --ci --config C:\tmp\flovart-rc13-tauri.conf.json --bundles nsis`
- Configuration: isolated test overlay enabling updater artifacts; no production
  signing key or Authenticode certificate was used.
- Target: Windows x64 NSIS
- Package: `src-tauri/target/release/bundle/nsis/Flovart_0.3.2_x64-setup.exe`
- Size: `12,249,543` bytes
- SHA-256: `962D27A1B44FC0F56B82EBA47345B8F1A62F0BAA836FE22476CF634F815D74A9`
- Updater signature: `416` bytes; SHA-256
  `980021B6681F62090158DCD9A573C96530AB0CDB889E73CE96CD7A4BD8D9DD24`
- Authenticode: `NotSigned` (expected for this local RC build; no production signing key was used)

This is the final post-hardening rebuild, after the source and release-workflow
changes recorded in `HANDOFF.md`; the same signed-test package was used for the
installation smoke below.

## Isolated install smoke

- Installer mode: NSIS silent install into a unique temporary directory.
- Installer exit code: `0`.
- Installed executable: `flovart-host.exe`.
- Installed Desktop process remained alive after an eight-second launch check and was then closed by its main window.
- No process from the temporary install directory remained before uninstall.
- Uninstaller exit code: `0`.
- Temporary install directory was absent after uninstall.

Machine-readable smoke result:

```json
{"installExit":0,"launchObserved":true,"closeMode":"graceful","uninstallExit":0,"installRootExistsAfterUninstall":false}
```

## Scope and remaining gate

This proves the current worktree can produce, install, launch, and uninstall a
real NSIS package without Node/npm/Rust on the installed path. It does not prove
production code signing, updater signing, or a real paid-provider generation;
those remain separate RC13/external certification gates.
