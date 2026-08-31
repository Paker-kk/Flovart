# Flovart Release Candidate Baseline

## Scope

这是 Release Candidate Hardening 的本机基线。它记录的是运行时/测试环境状态，不代表当前 Git 工作树干净；已有 U0–U9 修改按约定保留，未执行 reset、checkout 或清理用户改动。

## Environment

- Collected: 2026-08-31
- OS: Microsoft Windows 11 专业工作站版 `10.0.26200`
- CPU: 11th Gen Intel(R) Core(TM) i5-11400H @ 2.70GHz
- Logical processors: 12
- Visible memory: 15.65 GiB
- Node.js: `v24.14.0`
- npm: `11.9.0`
- Rust: `rustc 1.94.1 (e408947bf 2026-03-25)`
- Cargo: `1.94.1 (29ea6fb6a 2026-03-24)`
- Flovart package version: `0.3.2`
- HEAD at baseline: `af493d8dae304f7a58d4850eae0434cd55a694f1`

## Worktree

- Runtime/process baseline: clean.
- Git worktree: intentionally dirty; 37 existing modified/untracked paths were present before this baseline file was added.
- No user changes were reverted or overwritten.

## Process and port cleanup

Stopped only processes attributable to the previous automated acceptance runs:

- four orphaned Flovart `npm run dev` / Vite branches;
- four Playwright core smoke runners and their temporary Edge children;
- one Edge `flovart-edge-bootstrap-profile-*` process tree;
- one orphaned `node agent/index.js` owning port `17373`.

The Codex/Playwright MCP browser process was not stopped. After cleanup, no known Flovart test/Vite process remained and ports `37521`, `37522`, `37523`, `17373`, `11451`, `8411`, `8438`, `8749`, `8787`, and `8788` had no listeners.

## RC0 verification commands

The following gates are run from this repository after the process cleanup. Results are appended here when each command completes:

- `npx vitest run --no-file-parallelism --maxWorkers=1 --reporter=dot`
- `npm test -- --reporter=dot`
- `npx tsc --noEmit`
- `npm run build`
- `npm run ext:build`
- `npm --prefix dsh-plugin run build`
- `cargo test --all-targets` from `src-tauri`
- `git diff --check`

## RC0 results

- Vitest (standard `npm test`): `143` files passed; `998` passed, `1` skipped (`999` total), exit code `0`; duration `66.03s`.
- Vitest diagnostic single-worker mode: one full-suite run timed out in `tests/workflowImageTools.test.tsx` after `15s`; the isolated transaction test passed `20/20` repetitions and the standard suite passed. This is recorded as a non-release execution-mode stability risk, not as a business-logic pass.
- TypeScript: `npx tsc --noEmit` passed.
- Web build: `npm run build` passed; Vite transformed `4303` modules. Existing dynamic-import and large-chunk warnings remain.
- Extension build: `npm run ext:build` passed and produced `dist-extension`.
- DSH build: `npm --prefix dsh-plugin run build` passed; client loader contract verified.
- Rust: `cargo test --all-targets` passed with `36` tests and no failures.
- Diff hygiene: `git diff --check` passed; Git only reported existing LF/CRLF normalization warnings.
