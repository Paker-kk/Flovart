---
name: flovart
description: Operate Flovart's local Production Runtime, topic-research adapter, visible Workflow Workspace, and Terminal Command Center through its canonical local CLI. Use when an agent needs to collect recent topic evidence, control visible Workflow nodes, supervise durable provider tasks, open the Flovart WebUI, or coordinate a Director Skill. Trust command.list over examples and never use legacy shadow/file-bridge, Canvas, or Element commands.
---

# Flovart production control

Flovart exposes NO MCP server to coding agents. The CLI is the only agent-facing
interface: deterministic, machine-readable, and safe for local coding agents
(Claude Code, Codex, OpenCode, ...). This file is a coding-agent attachment —
install it into your project with `npx flovart-cli init`.

Use the deterministic local CLI for every Flovart side effect:

```bash
npx flovart-cli <command> --json
```

Source contributors may use:

```bash
npm run flovart:cli -- <command> --json
```

## First use and source of truth

Use the stable Agent surface for normal work. Start with readiness and inspect; consult the client-side registry only during bootstrap, discovery, or debugging:

```bash
npx flovart-cli status --json
npx flovart-cli start --open --json   # only when status is not ready
npx flovart-cli workflow.inspect --json
```

Read a command schema only before an unfamiliar or compatibility command:

```bash
npx flovart-cli command.schema --command <command> --json
```

Only call commands whose registry availability is `available`. `command.list` / `command.schema` are not part of the normal model-facing loop. If this Skill, a Director Skill, or an old example disagrees with the registry, stop using the stale command.

For visible node work, require `workspace.status`. For generation work, additionally require `runtime.status` and `provider.status`. Registry inspection does not require Desktop Runtime connectivity.

## Authority and adapter boundaries

- Production Runtime owns credentials, Provider routing, idempotent generation tasks, events, cancellation state, and Artifacts.
- Workspace Adapter owns the currently visible browser Workflow project and delegates every graph mutation to the same dispatcher used by manual UI edits.
- Research Adapter collects external topic evidence into idempotent local artifacts. It reports source coverage but does not own ProductionRun state.
- A Director Skill compiles creative intent, beats, style rules, review gates, and capability requirements. It never becomes another execution backend.
- A coding agent plans, inspects, compares, and chooses the smallest revision or retry.
- The stable Agent Canvas contract is `workflow.inspect` → `workflow.selection.get` when selection context is needed → `workflow.apply` for structured document operations → `workflow.node.run` for execution.
- The Agent defaults to the current Browser binding, must fail explicitly when it is unavailable, and must not treat React/localforage Workflow graph data as an authority or re-parse Provider details.

## Host Projection

The Core contract is independent of the calling Host. `host.list` performs PATH-only discovery of Agent Identities and reports available Distribution Targets and Runtime Surfaces; it never reads login state or credentials. `init --target <target>` installs the Skill into a Distribution Target such as `codex` (normalized to `codex-skill`), `codebuddy-code-skill`, `claude-code-skill`, or `opencode-skill`.

Codex is the current professional golden path. CodeBuddy Code is a compatible coding-agent projection; DeepSeek Harness keeps its explicit native Plugin projection. WorkBuddy is a future mainstream, skill-mediated projection and is not a Director Runtime Binding. Do not add it to `director.bind` or put Host-specific logic in Workflow Core.

For external Coding Agent Workflow calls, include the current Host Identity as
transport metadata: Codex uses `--agent-identity codex`, Claude Code uses
`--agent-identity claude-code`, and OpenCode uses `--agent-identity opencode`.
This value is not a Workflow field. The first tagged `workflow.inspect` claims
the Host writer; a different Host must be explicitly activated in Flovart before
it can write. Add `--host-session-id` only when the Host provides a stable
session identity.

## Skill roles

- This `flovart` Skill is the capability/SOP layer: readiness, command discovery, Workflow inspect, structured mutation, execution and recovery. It is not a Runtime or a second state store.
- A Production Skill is a separate creative SOP: it contributes briefs, beats, style rules and review gates, then hands a provider-neutral ProductionSpec to Flovart. It must not hold credentials, call Provider HTTP, or mutate Workflow state directly.
- A `PromptAsset` is a reusable provider-neutral prompt plus modality, tags, model hints and reference-role requirements. Treat its text as input to PromptBar/Director planning; Provider wire fields and API keys stay outside the asset.

Never send Workspace commands to `shadow-runtime-state.json`, a Vite file queue, browser scraping, CDP, or private globals.

## Connect the visible Workflow

Node commands require:

1. Start Flovart Desktop; Desktop idempotently starts or reuses its Production Crew and Workspace Adapter services.
2. Open the target Workflow.
3. Run `workspace.status`; continue only when `state` is `ready` and `activeProjectId` is the intended project.

If the page, Workspace Adapter, or project snapshot is unavailable, stop on `WORKSPACE_UNAVAILABLE`. Never fall back to a hidden graph.

## Open the WebUI

When a user asks to open or prepare Flovart, use the companion `open-flovart`
Skill first. It calls `status --json` and, when needed, `start --open --json`;
the CLI owns local Agent startup and bootstrap handoff. Do not read
`~/.flovart/agent.json`, copy a token, guess a port, or build a private browser
URL in the Skill.

The CLI can open the running Flovart WebUI in the OS default browser (Windows system URL handler, macOS `open`, Linux `xdg-open`; it probes known local endpoints first). The Windows launcher passes the complete bootstrap URI without routing it through a shell.

```bash
npx flovart-cli web.open --json
# explicit endpoint:
npx flovart-cli web.open --url http://127.0.0.1:37521 --json
```

`web.open` answers `NO_WEBUI` when nothing is listening; start services with `npx flovart-cli start --open` or `npm run dev` first. Use this before guiding a user to look at their Workflow.

## Shell and operating system

The CLI is Node.js, not PowerShell-specific. Use Node.js 20.10 or newer:

- Windows PowerShell: run the commands as written.
- macOS zsh/bash: run the same `npx flovart-cli` commands; the Agent config is `~/.flovart/agent.json`.
- WSL with Agent inside the same distribution: run the same commands and connect the Windows browser to the loopback URL reported by `flovart status --json` (default source Agent port is `17373`).
- WSL with Agent on Windows: require WSL mirrored networking and run `export FLOVART_AGENT_CONFIG=/mnt/c/Users/<WindowsUser>/.flovart/agent.json`.

Keep commands on one line. Use single quotes around JSON values in PowerShell, zsh, and bash. Do not assume Windows Desktop Runtime discovery is reachable from WSL; node-only Workspace commands remain independent from Runtime commands.

## Reliable node workflow

1. Run `status`, then `workflow.inspect` and use returned project/node/connection IDs; use `workflow.selection.get` when the current selection is part of the intent.
2. For create operations, provide a stable explicit node ID when the schema allows it.
3. Give every write command a stable `--idempotency-key`.
4. Prefer one `workflow.apply` call with structured `operations` for a batch; otherwise use the smallest compatibility adapter:
   - `workflow.node.create` / `workflow.node.create-connected`
   - `workflow.node.update` for title, prompt, config, or metadata fine-tuning
   - `workflow.node.move` / `workflow.node.resize`
   - `workflow.connect` / `workflow.disconnect`
   - `workflow.select` / `workflow.viewport.set`
5. Run a config node only through `workflow.node.run`; execution remains separate from document mutation.
6. Re-run `workflow.inspect` and verify the exact visible result.
7. On timeout or disconnect, inspect before retrying. Reuse the same idempotency key only with the identical payload.

Example:

```bash
npx flovart-cli workflow.node.create --id shot-01 --type text --title "镜头 01" --x 120 --y 160 --metadata-json '{"content":"初始镜头说明"}' --idempotency-key "create-shot-01-v1" --json
npx flovart-cli workflow.node.update --node-id shot-01 --patch-json '{"title":"镜头 01：开场","metadata":{"content":"修改后的细节"}}' --idempotency-key "update-shot-01-v2" --json
```

Confirm the current schemas before copying examples.

## Skill ecosystem

Manage local Skill packages and the external Skill Hub entirely from the CLI:

```bash
# scan every local root: project .agents/skills + ~/.claude/skills + ~/.codex/skills + ~/.flovart/skills (+ FLOVART_SKILLS_DIRS)
npx flovart-cli skill.list --json
# one installed Production Skill's manifest (contentHash is the binding key)
npx flovart-cli skill.manifest community.vox-director --json
# install from the external Skill Hub (https or loopback http only)
npx flovart-cli skill.install community.demo --hub-url https://skills.example.com --json
# install from a local directory (already downloaded package)
npx flovart-cli skill.install community.demo --from-dir ./community.demo --json
# remove an app-installed package (bundled skills are protected)
npx flovart-cli skill.uninstall community.demo --json
# sync the external Hub catalog for browsing
npx flovart-cli skill.hub.list https://skills.example.com --json
```

1. Treat `skill.list` as the local source of truth; `location: project` packages are app-managed, `user-coding-agent` packages live in your coding agent's own skill directories.
2. `contentHash` from `skill.manifest` is the exact binding value to pass as `director.contentHash` in `production.dry-run`.
3. Install packages only from hubs you trust. The CLI validates package structure, id, version, and path safety, but never inspects a package's creative guidance for your intent.

## Topic research workflow

Use `research.topic.collect` before drafting a trend-led ProductionSpec:

```bash
npx flovart-cli research.topic.collect --topic "US politics" --sources '["reddit","x"]' --subreddits '["politics","worldnews","news"]' --days 30 --idempotency-key "politics-30d-v1" --json
```

1. Inspect the current schema and pass explicit sources, communities, window, and a stable idempotency key.
2. Accept `ready` only when every requested source has evidence. `degraded` means at least one source is missing; `failed` means no requested source produced usable evidence.
3. Treat Reddit RSS position as a rank proxy, never as votes, comments, or cross-platform popularity.
4. X is credential-gated. If it is missing, preserve `coverage.missing: ["x"]`; never invent X posts or silently label web-search snippets as X API evidence.
5. Read the JSON/Markdown artifact paths returned by the command and keep their provenance when converting the selected topic into a ProductionSpec.
6. A Director Skill consumes this artifact. It must not add a private scraper, API key, Provider call, or second research state store.

For a Reddit-only decision, request only `["reddit"]`; do not request X merely to make the report look broader.

## Generation workflow

1. Verify Runtime and Provider readiness.
2. Ask the user to configure missing credentials in Flovart Desktop. Never request or transport a raw key in chat or CLI arguments.
3. Submit the smallest available generation command with typed arguments and a stable idempotency key.
4. Save its `taskId`; observe it with `task.get`, `task.list`, and `event.stream`.
5. Retry only after the existing task reaches a known terminal state.
6. Treat `task.cancel` as local cooperative cancellation unless Provider state explicitly confirms remote cancellation.
7. Distinguish price preview from final bill.

Production Plan Projection is available: a completed `production.dry-run` is persisted as a ProductionRun and StageRun DAG, and the Desktop automatically materializes its latest `workflow.projection.get` result into the matching visible project. Projection refresh preserves user nodes, user connections, viewport, and manual projected-node layout.

Current limitation: generated Runtime Artifacts do not yet attach themselves to the matching projected StageRun node. Never inject private Artifact paths or signed URLs into node metadata.

## Compile a Director ProductionSpec

Run the Director quality gate first, then compile without Provider submission:

```bash
# contentHash comes from: npx flovart-cli skill.manifest vox-director --json
npx flovart-cli production.dry-run --project-id <project-id> --title "VOX Production Plan" --director '{"skillId":"vox-director","version":"1.0.0","contentHash":"sha256:<hash>"}' --file <production-spec.json> --idempotency-key "<stable-plan-key>" --json
```

1. Save the returned `taskId` and wait with `task.get`.
2. Read `productionRunId` from the completed task result.
3. Inspect `production.status --run-id <run-id>` and treat every blocker as real.
4. Read `workflow.projection.get --project-id <project-id>`; the Desktop projection adapter should also place the same plan on the real Workflow.
5. Verify the materialized nodes through `workflow.inspect`.

`production.dry-run` creates no Provider job and spends no credits. A current plan remains `action_required` while Route Plan, Run Budget, or required Runtime Capabilities are missing. Do not reinterpret it as an executable or completed film.

## Director Skill coordination

Treat a Director Skill as a compiler into a versioned ProductionSpec draft. Its output may contain:

- brief and delivery constraints;
- beats, shots, narration, and references;
- style extension data;
- Provider-neutral capability requirements;
- Director review gates and eval expectations.

Reject or migrate packages containing API keys, Provider HTTP calls, hard-coded private routes, arbitrary shell commands, or private polling loops.

For a VOX/collage Director draft, run the deterministic quality gate before any paid keyframe or motion task:

```bash
node tools/flovart/vox-director-quality.js --spec <production-spec.json> --json
```

Do not substitute a generic `paper-cut` prompt for the Director extension. A passing draft must preserve an approved theme, rich torn-paper/halftone/newsprint/tape finish, two-shot beat cadence, per-shot camera and element motion, keyframe review, OCR review, and audio design. Generate and approve collage keyframes before calling image-to-video; direct text-to-video is a tracer path, not a VOX-quality path.

## Terminal Command Center

Run `npx flovart-cli tui`. The Ink TUI observes Runtime, Workflow, durable tasks, and recent events; `/research <topic>` invokes the canonical research command. The TUI is only an interaction surface: it never stores credentials, performs Provider requests directly, or becomes a second production authority.

## Delivery

Report:

- visible project, node, and connection IDs changed;
- the before/after field or layout details verified by `workflow.inspect`;
- task, Provider-attempt, and Artifact IDs that actually exist;
- quote versus confirmed cost;
- pending work and the smallest safe next action;
- whether the result is visible on the Workflow or remains an off-canvas Artifact.
