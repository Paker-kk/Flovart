---
name: open-flovart
description: Open Flovart and prepare the visible local Workflow for CLI or coding-agent control. Use when a user asks to open Flovart, connect the current Workflow, or make Flovart ready for workflow.inspect, workflow.apply, or workflow.node.run.
---

# Open Flovart

This Skill only prepares the local Flovart browser workspace. It does not
implement a second bridge, read Agent configuration files, or construct an
Agent token.

## Bootstrap sequence

Use the canonical CLI from the current project. A Codex projection can be prepared once with `npx flovart-cli init --target codex`; this is a Distribution Target alias for the project-local Codex Skill and does not configure MCP or ask for connection details.

Use the canonical CLI from the current project:

```bash
npx flovart-cli status --json
```

Treat the returned `status` data as the only readiness signal. Continue when:

```text
data.ready = true
data.browserConnected = true
```

If the local system is not ready, ask the CLI to start the local Runtime and
open the visible Workflow:

For an automated browser acceptance run, skip the command below and use
`npm run test:browser:chrome`; only a manual user request should use `--open`.

```bash
npx flovart-cli start --open --json
```

In a source checkout the same command starts the Vite WebUI and Browser Agent;
from an installed Agent Toolkit it starts or reuses the embedded Desktop
Runtime and its managed local services. Do not replace it with a guessed port
or a direct browser URL. The launcher owns startup, the short-lived bootstrap
handoff, and the browser opening. The browser owns the visible Workflow state.

Poll the status command again after startup until it is ready or the command
reports a concrete failure. Do not wait forever. Report `frontend`, `agent`,
and `browser` states when it remains unavailable.

For automated validation, do not use `--open`: it delegates to the Windows
default URL handler and may open an unrelated browser window. Use the
repository Chrome smoke harness instead:

```bash
npm run test:browser:chrome
```

The harness starts the source WebUI and Browser Agent with
`--no-open --web-port=0 --agent-port=0`, launches Playwright's Chrome for
Testing executable, and navigates to the one-time bootstrap URL itself. A
manual user request to open Flovart may still use `--open`.

If `start --open --json` reports a pending Browser binding or times out after
opening the page, do not immediately run `start` again. Poll `status --json`
for the same bootstrap attempt; the local services stay alive while the page
finishes loading, and the launcher suppresses duplicate browser opens. Only
start again after the services are confirmed offline or the user explicitly
requests a fresh page.

## Handoff to Workflow operations

Once ready, hand off to the main Flovart Skill:

```bash
npx flovart-cli workflow.inspect --json
```

Use `command.list` / `command.schema` only when a command is unfamiliar or the
CLI reports a contract mismatch.

Only then use `workflow.apply`/the available Workflow mutation commands or
`workflow.node.run`, with the schema's current arguments and an explicit
idempotency key for writes.

## Prohibited shortcuts

- Do not read `~/.flovart/agent.json` from the Skill.
- Do not copy or print a token.
- Do not guess ports or probe private HTTP endpoints.
- Do not use CDP, browser scraping, React setters, shadow state, or a hidden
  Workflow copy.
- Do not treat Agent offline as a reason to block ordinary Workflow navigation;
  it only blocks external Workflow control.
