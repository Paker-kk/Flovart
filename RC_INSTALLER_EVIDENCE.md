# Release Candidate Windows Installer Evidence

## Build

- Command: `npm run tauri:build`
- Configuration: `src-tauri/tauri.local.conf.json` (local RC build; updater artifact creation disabled)
- Target: Windows x64 NSIS
- Package: `src-tauri/target/release/bundle/nsis/Flovart_0.3.2_x64-setup.exe`
- Size: `12,250,945` bytes
- SHA-256: `076DF69695AD0C41EDE431426828CA9BA9B9330C1FE39A01307635F633EAF4FC`
- Authenticode: `NotSigned` (expected for this local RC build; no production signing key was used)

## Isolated install smoke

- Installer mode: NSIS silent install into a unique temporary directory.
- Installer exit code: `0`.
- Installed files included `flovart.exe`, `flovart-host.exe`, and `uninstall.exe`.
- Installed Desktop process remained alive after an eight-second launch check and was then closed by its main window.
- No process from the temporary install directory remained before uninstall.
- Uninstaller exit code: `0`.
- Temporary install directory was removed after uninstall.

## Scope and remaining gate

This proves the current worktree can produce, install, launch, and uninstall a
real NSIS package without Node/npm/Rust on the installed path. It does not prove
production code signing, updater signing, or a real paid-provider generation;
those remain separate RC13/external certification gates.
