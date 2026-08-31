---
name: flovart
description: Operate Flovart Workflow projects, nodes, providers, product models, assets, and generation jobs through the deterministic local CLI. Use when an agent needs to inspect or change Flovart production state, run image or video generation, diagnose provider readiness, or export project metadata. The current CLI command surface covers Workflow, not Table; never invent removed Canvas or Element commands, and do not claim Table automation until it appears in command.list.
---

# Flovart CLI

Use the local deterministic CLI for every Flovart mutation. In an installed Toolkit:

```bash
npx flovart-cli <command> --json
```

Source contributors may use `npm run flovart:cli -- <command> --json` inside the repository.

Start a normal session with readiness, not registry discovery:

```bash
npx flovart-cli status --json
npx flovart-cli start --open --json   # only when status is not ready
npx flovart-cli workflow.inspect --json
```

Poll `status --json` until the local Agent, WebUI, and visible Browser Workflow are ready. Use `command.list` / `command.schema` only for bootstrap, an unfamiliar compatibility command, or a contract mismatch; they are never part of the normal model-facing loop. If this file or another reference disagrees with the registry, trust the registry and stop using the stale command.

For normal Agent work, use the stable surface (`status`, `workflow.inspect`, `workflow.selection.get`, `workflow.apply`, `workflow.node.run`). `command.list` and `command.schema` are bootstrap/discovery/debug tools, not a second model-facing tool surface.

## Product boundary

- Workflow is the current automated generation workspace.
- Table is the official second workspace for agent storyboards and media preprocessing, but it has no registered CLI commands yet.
- Canvas and Art are removed product workspaces. Do not call `canvas.*`, `element.*`, or their old aliases.
- Do not turn a user request for Table into Workflow state unless the user explicitly asks for that fallback.

## Safety rules

- Let the external agent plan scripts, shots, prompts, retries, and delivery; use Flovart only for deterministic state changes and generation.
- Never read, print, copy, or store API keys. Provider credentials stay in the local Flovart Runtime/WebUI.
- Keep the local Flovart Runtime/WebUI running for provider-backed commands.
- Do not invent private HTTP calls, scrape the UI, or add another protocol server.
- Inspect before mutation, send explicit prompts and typed arguments, and retry only the smallest failed node or job.
- Do not submit a duplicate long-running job until its current status is known.
- The stable Agent Canvas contract is `workflow.inspect` → `workflow.selection.get` when selection context is needed → `workflow.apply` for structured document operations → `workflow.node.run` for execution.
- Granular Workflow commands remain compatibility adapters. A Browser-bound command with no visible browser fails with `WORKSPACE_UNAVAILABLE`; it never falls back to a hidden/native graph.
- The Agent defaults to the current Browser binding, must fail explicitly when it is unavailable, and must not treat React/localforage Workflow graph data as an authority or re-parse Provider details.

## Host Projection

The Core contract is independent of the calling Host. `host.list` performs PATH-only discovery of Agent Identities and reports available Distribution Targets and Runtime Surfaces; it never reads login state or credentials. `init --target <target>` installs the Skill into a Distribution Target such as `codex-skill`, `codebuddy-code-skill`, `claude-code-skill`, or `opencode-skill`.

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

## Setup

```bash
npx flovart-cli install
npx flovart-cli start
npx flovart-cli status --json
npx flovart-cli provider.status --json
```

If setup is incomplete:

```bash
npx flovart-cli provider.begin-setup --purpose both --json
```

`provider.begin-setup` is a legacy-compatible bridge; prefer the local Settings
page for normal setup. Ask the user to enter credentials there. Never request a
key in chat.

## Install

Flovart exposes no MCP server to coding agents. The canonical local CLI is the only agent-facing interface. Install this SKILL as a coding-agent attachment:

```bash
npx flovart-cli init --target project-skill
```

This writes `.agents/skills/flovart/SKILL.md` into the current project. Use `--target codex-skill`, `--target codebuddy-code-skill`, `--target claude-code-skill`, or `--target opencode-skill` for an explicit projection. Never use legacy shadow/file-bridge, Canvas, or Element commands.

## Operating workflow

1. Run `status`; if it is not ready, use `start --open --json` and poll again.
2. Inspect the redacted graph with `workflow.inspect`; use `workflow.selection.get` when the current selection is part of the intent.
3. Give every write command a stable `--idempotency-key`; for `workflow.apply`, also provide the matching `--mutation-id`.
4. Prefer one `workflow.apply` call with structured `operations` for a batch; use granular `workflow.*` commands only when their schemas are the smallest compatibility adapter.
5. Run a config node with `workflow.node.run`; direct Runtime generation commands remain CLI-only capability commands, not additional model tools.
6. Re-inspect and return project, node, connection, artifact, and job IDs plus any remaining user action.

Example discovery and graph setup:

```bash
npx flovart-cli command.schema --command workflow.node.create --json
npx flovart-cli workflow.project.create --title "产品视频" --json
npx flovart-cli workflow.node.create --type text --title "创作 Brief" --x 80 --y 120 --json
npx flovart-cli workflow.inspect --json
```

Never copy arguments such as `--wait`, `--place-on-canvas`, or `--duration` from old examples without confirming they exist in the current schema.

## Delivery

Report:

- what changed in the Workflow;
- important project, node, connection, artifact, and job IDs;
- failed or pending work with the smallest retry plan;
- any browser action needed for provider setup;
- that Table automation is unavailable when the requested Table command is not registered.
