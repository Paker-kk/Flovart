# Flovart Release Truth Matrix

## R0 verdict

```text
R0 RELEASE TRUTH AUDIT: FAIL
CURRENT LAUNCH VERDICT: NO-GO
```

The local architecture refactor is substantially ahead of the published `main` branch, but Flovart currently has more than one externally observable truth. Public documentation, local documentation, packaged Skills, CLI compatibility code, product surfaces and the release pipeline do not yet describe one certifiable release.

This matrix distinguishes three scopes:

- **Published main:** what an unknown GitHub visitor can read or download now.
- **Local committed source:** the architecture in the current local branch before uncommitted work.
- **Local working tree:** the current release-candidate work, including preserved uncommitted first-run/fake-Provider changes.

R0 labels are `TRUE`, `STALE`, `PARTIAL`, `UNVERIFIED`, and `FALSE`. They are claim-parity labels, not launch PASS states.

## Truth matrix

| Surface / claim | Published main | Local source / working tree | Evidence | R0 status | Blocking |
| --- | --- | --- | --- | --- | --- |
| Product is Workflow + Table + Agent | Public README describes these three surfaces | `App.tsx` mounts `WorkflowWorkspace`, `TableWorkspace` and `AgentWorkspace` | Static route/mount inspection | `TRUE` at naming level | No |
| Table is a usable independent node-style media processing workspace | Public copy presents Table as a product surface | `components/table/TableWorkspace.tsx` currently says Table does not create a second node graph; project todo calls the body an unfinished placeholder | Source + progress docs | `FALSE` | **P1** if advertised as mature |
| Agent is a spatial production workspace rather than only a Workflow drawer | Public copy presents an Agent surface | `AgentWorkspace` is mounted as a top-level surface; Workflow has a separate Production Crew status area | Source inspection | `PARTIAL` pending real-user path | Yes, if the public UX claim exceeds evidence |
| Stable model-facing Agent surface is exactly five tools | Public README still teaches discovery commands as a normal first step | Local model tool projection contains `status`, `workflow.inspect`, `workflow.selection.get`, `workflow.apply`, `workflow.node.run` | `agent/tools.js`, local README/Quick Start, CLI registry | `STALE` publicly, `TRUE` locally | **P1** docs blocker |
| `command.list` / `command.schema` are diagnostics/bootstrap only | Public README instructs users to start with them | Local README/Skills demote them; DSH YAML comment still describes deriving tools from them | Public README, local docs, `dsh-plugin/cordis.patch.yml` | `STALE` | **P1** |
| CLI initialization uses `--target` | Published README shows `init --host codex` | Local Quick Start and CLI use `init --target`; Host Projection separates Agent Identity from target | Public/local README and CLI source | `STALE` publicly | **P1** |
| Current Workflow command is `workflow.inspect` | Published Quick Start still documents `canvas.inspect` | Local CLI/Agent surface uses `workflow.inspect`; removed Canvas/Element model surface is rejected | Public Quick Start, local registry/tests | `STALE` publicly | **P1** |
| Browser authority uses automatic binding | Published Quick Start still describes file-state runtime and browser polling `.flovart/command-queue.json` | Local Browser contract/bootstrap uses authenticated loopback registration and active-writer binding | Public Quick Start; `BrowserWorkflowContract`, Agent session and HANDOFF evidence | `STALE` publicly, `PARTIAL` locally | **P1** |
| README Quick Start is executable from a clean user state | Public instructions target older CLI/runtime architecture | Local docs have newer commands but have not passed a clean-state docs Golden Path on a release artifact | Live public docs + local inspection | `FALSE` publicly / `UNVERIFIED` locally | **P1** |
| Standard CLI help works | Published docs imply ordinary CLI behavior | `node tools/flovart/cli.js help` works; conventional `--help` resolves to invalid command `..help` and returns `CLI_FATAL` | Direct command execution | `PARTIAL` | P1 installation/usability |
| CLI registry is the canonical compatibility contract | Public docs point to registry | `command.list --json` reads the canonical registry and stable Workflow commands route through Browser Workspace | Direct execution + registry source | `TRUE` for compatibility registry | No |
| No second hidden Workflow authority | Public docs do not disclose one | Public Workflow commands use Workspace, but `tools/flovart/shadow-runtime.js` still contains a packaged file-state Workflow implementation and dedicated tests | CLI imports, package contents, `shadowRuntime.test.ts` | `PARTIAL` / architecture drift | **P1 candidate** pending caller proof |
| Source Skill and packaged Skill are identical | Public repository exposes a Skill | `.agents/skills/flovart/SKILL.md`, `tools/flovart/skill/SKILL.md`, and `skills/flovart/SKILL.md` differ; package install prefers the tools copy | File comparison and `tools/flovart/agent-kit.js` | `FALSE` | **P1** truth-source failure |
| Skill never teaches removed queue/Canvas paths | Public copy is stale | Current `.agents`/tools copies reject legacy shadow/Canvas; root `skills/` copy is older and narrower | Three Skill files | `PARTIAL` | **P1** until generated from one source |
| Codex is formally supported | Public/local README lists Codex in the formal support set | Browser/CLI fixture tracers pass, but this machine has no logged-in Codex Golden Path | HANDOFF external-agent evidence | `UNVERIFIED` | `BLOCKED_EXTERNAL` certification + **P1 claim** |
| Claude Code is supported | Public/local README lists Claude Code | Real local `status → inspect → apply → inspect` tracer is recorded | HANDOFF evidence; must be revalidated for RC | `PARTIAL` | No, pending final rerun |
| OpenCode is supported | Public/local README lists OpenCode | Real local `status → inspect → apply → inspect` tracer is recorded | HANDOFF evidence; must be revalidated for RC | `PARTIAL` | No, pending final rerun |
| DSH is formally supported | Public/local README lists DSH | RC8 profile/boot/native draft paths pass, but real logged-in reload, failed-upgrade rollback and authority transfer remain unverified | `dsh-plugin/README.md`, HANDOFF | `PARTIAL` | **P1 claim** unless relabeled Developer Preview |
| Pi is formally supported | Public/local README lists Pi | Compatibility projection exists, but no current final real-host certification is recorded | Host projection/docs inspection | `UNVERIFIED` | **P1 claim** unless relabeled |
| Extension is a production integration | Public docs list Browser integration | `extension/README.md` honestly describes a development thin import companion; store ID, Native Host registration and installer hooks are not release-certified | Extension README/manifest/progress docs | `PARTIAL` | No if labeled experimental |
| Extension never stores Provider secrets | Extension docs say it does not | `hooks/useApiKeys.ts` retains a `chrome.storage.local` synchronization path when an extension API is exposed | Docs + source inspection | `PARTIAL` / security ambiguity | **P1 candidate** |
| Provider extension is declarative and secret-isolated | Public docs describe provider extension | `docs/dev/provider-extension-contract.md` uses a declarative JSON DSL, public/HTTPS constraints and no arbitrary JS/raw secret | Docs + implementation inspection pending | `PARTIAL` | R5/R14 verification required |
| User-script Provider sandbox rejects privileged APIs | Launch claim requires this | No complete real sandbox failure matrix has been evidenced in R0 | Test search/source audit pending | `UNVERIFIED` | R5 blocker |
| Node Plugin lifecycle is production-ready | Public docs present a Plugin SDK | In-memory SDK supports reference plugin install/update/enable/disable/uninstall; no persistent permission/trust model or rollback certification | `components/workflow/nodePluginSdk.tsx` | `PARTIAL` | **P1** if advertised as production-ready |
| Plugins declare capabilities/trust/source/version/permissions | Launch requirement | Current definition lacks the complete trust and permission contract | Plugin SDK types | `FALSE` | **P1** |
| OpenAI-compatible first configuration is a normal-user path | Published release predates current work | Working tree mounts Onboarding, defaults to OpenAI-compatible, validates `/models`, and suggests missing product routes | Dirty `App.tsx`, Onboarding, setup service/tests | `PARTIAL` | Must pass Browser Golden Path |
| Fake Provider exercises real transport | Not a public claim | Working tree adds a local HTTP fake server/recorder and tests, not yet fully certified in a Browser | Untracked server/tests and HANDOFF | `PARTIAL` | R4/R5 blocker |
| Unsupported I2I/I2V never silently falls back | Public claim is not explicit | Canonical validation tests exist, but real fake-Provider wire proof for all four modes is not complete | Existing/dirty generation tests | `UNVERIFIED` | R4 blocker |
| Paid generation requires human approval | Public UX implies user control | Browser bridge asks via `window.confirm`, but the dispatcher accepts caller-supplied `args.confirmed === true`; a durable unforgeable approval receipt is absent | `services/workflowAgentBridge.ts`, `services/workflowDispatcher.ts` | `FALSE` at trust boundary | **P0 candidate; reproduce before mutation** |
| Logical generation is exactly-once | Required release property | Dispatcher idempotency cache is in-memory and not durable across refresh/restart; paid-like retry/restart evidence is absent | Dispatcher source/tests | `UNVERIFIED` | **P0/P1 depending provider behavior** |
| API keys are securely stored | README says keys are encrypted in local storage | `utils/keyVault.ts` uses AES-GCM with origin/user-agent-derived material and same-origin salt; it protects at-rest readability but is not OS keyring isolation | README + key vault source | `PARTIAL` / claim needs precision | Security claim blocker |
| Diagnostics/logs cannot leak secrets | Required launch property | Redaction helpers/tests exist in Agent paths, but no canary across Browser, CLI, fake Provider, diagnostics and artifacts has run | Source/tests | `UNVERIFIED` | R14/R19 blocker |
| Version has one product value | Public latest release is `v0.2.0-test` | `VERSION`, root/toolkit package, Cargo and Tauri align at `0.3.2`; version checker passes | `node scripts/check-release-version.mjs` | `TRUE` locally, `STALE` publicly | Release blocker until artifact/publish |
| Windows NSIS artifact is current and clean-install certified | Public Releases provide an older test installer | Tauri config targets NSIS; current 0.3.2 clean build/install evidence is absent | Public Releases + Tauri config | `UNVERIFIED` | **P0/P1 release blocker** |
| Windows installer is code-signed | Formal Windows release requires it | Tauri config has no certificate thumbprint/timestamp configuration | `src-tauri/tauri.conf.json` | `FALSE` | `BLOCKED_EXTERNAL` plus release setup |
| Updater artifacts require signature | Tauri requires signature verification | Updater public key/endpoints and artifact setting exist; ignored local key material exists but production provenance/ownership is unverified | Tauri config, ignore/tracking check; key contents not read | `PARTIAL` | External certification |
| Tauri CSP is restrictive | Public security claim is generic | Script source is self-only, but `connect-src` permits broad `https://*`; capability and host allowlists need reduction | Tauri config/capabilities | `PARTIAL` | R13 blocker |
| Release tags enforce all launch tests | Public workflow publishes artifacts | Desktop workflow builds/publishes but omits the full unit/type/Rust/extension/DSH/E2E/migration/security matrix | `.github/workflows/build-desktop.yml` | `FALSE` | **P1** |
| Release artifacts include checksums/SBOM/provenance | Launch requirement | Current workflows do not produce the complete set or GitHub attestation | Workflow inspection | `FALSE` | R26 blocker |
| CodeQL/dependency/security gates are release law | Launch requirement | No current CodeQL workflow or reachability triage gate was found | `.github/workflows` inspection | `FALSE` | R15 blocker |
| Public backup/recovery, uninstall, upgrade and known-limit docs exist | Launch requirement | Dedicated user-operable release docs were not found in the first R0 inventory | `rg --files` docs inventory | `FALSE` | **P1** docs blocker |
| Web/Desktop/extension storage boundary is clear | Public README notes IndexedDB isolation | Current public/local copy acknowledges default separation; no shared production bridge is certified | README/progress docs | `TRUE` as limitation, feature `PARTIAL` | No if disclosure remains prominent |
| Public release claims match current evidence | Public branch is behind local architecture and exposes older installer/docs | Local README also overstates some hosts/plugins/Table | Entire matrix | `FALSE` | **P1** launch blocker |

## Confirmed R0 blockers

### P1 — Published instructions describe a retired primary path

**Reproduction:** follow the current GitHub README/Quick Start and encounter `init --host`, normal-loop `command.list/schema`, `canvas.inspect`, file-state runtime and `.flovart/command-queue.json`, while the local stable surface uses `--target`, `workflow.*`, Browser authority and automatic binding.

**Next action:** fix local claims and add a docs-contract test; publish only after the release candidate is actually certified. Until push/publish authorization is granted, public parity remains external release work.

### P1 — Three divergent Flovart Skills

**Reproduction:** compare `.agents/skills/flovart/SKILL.md`, `tools/flovart/skill/SKILL.md` and `skills/flovart/SKILL.md`; package installation selects a different file from the workspace source.

**Next action:** designate one canonical Skill, generate/copy projections mechanically, and add a byte/semantic parity test to packaging/CI.

### P1 — Conventional CLI help fails

**Reproduction:**

```text
node tools/flovart/cli.js help       → help output
node tools/flovart/cli.js --help     → CLI_FATAL / Unknown Flovart command: ..help
```

**Next action:** normalize `--help`/`-h` before command parsing and test packaged CLI invocation.

### P1 — Release workflow is not release law

**Reproduction:** inspect `.github/workflows/build-desktop.yml`; it publishes Tauri artifacts without the mandatory test/type/Rust/extension/DSH/E2E/migration/security sequence and without checksum/SBOM/attestation evidence.

**Next action:** create one non-bypassable release-gate workflow, make artifact publishing depend on it, and validate workflow syntax in a branch-safe local/CI test.

### P1 — Product maturity claims exceed implementation

Table, plugin lifecycle, DSH/Codex/Pi host support and current installer are not all supported by real execution evidence.

**Next action:** either finish certification or label each capability Experimental/Developer Preview/Planned. Do not solve truth drift with future-tense architecture claims.

## P0 candidates requiring immediate reproduction

### Human approval can be represented by caller data

The Browser bridge creates a real human prompt, but the dispatcher trusts `args.confirmed === true`. If an Agent/CLI can submit that field directly, it can bypass the approval surface.

**Required proof:** invoke the canonical external command with `confirmed:true` while instrumenting the Provider submit count. If one request is emitted without a newly issued human approval receipt, classify as P0 and replace the boolean with a scoped, short-lived, single-use approval receipt validated at the execution boundary.

### Paid-like idempotency is not durable

The current dispatcher cache is process-memory-only. It does not by itself prove exactly-once effect after Browser refresh or Runtime restart.

**Required proof:** inject timeout/retry/double-click/refresh/restart against the fake HTTP Provider recorder. A duplicate submit is P0; ambiguous submission must become an explicit recoverable state, never automatic blind retry.

## R0 gate decision

R0 cannot pass until:

1. One canonical Skill and one documented CLI/Agent path exist.
2. Local README/Quick Start claims match actual support/certification status.
3. Docs-contract automation rejects retired commands and paths.
4. Conventional CLI help and package instructions work.
5. Public `main` is updated through an authorized release process.
6. Every remaining `PARTIAL` capability is either certified or explicitly labeled non-production.

The next autonomous priority is to reproduce and close the cost/side-effect P0 candidates, while preserving the existing first-run/fake-Provider work that provides the necessary wire-level recorder.
