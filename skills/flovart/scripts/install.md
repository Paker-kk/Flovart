# Install and Setup

Flovart CLI is local to this repository.

## Local Project Setup

```bash
npm install
npm run dev
npm run flovart:cli -- status --json
```

The Vite dev server uses port `37522`. Provider-backed commands require the browser app to stay open because API keys remain in browser storage.

## Agent Host Init

Flovart exposes no MCP server to coding agents; the CLI is the only agent-facing interface. Use `init` to install the Flovart SKILL as a coding-agent attachment (`.agents/skills/flovart/SKILL.md`):

```bash
npm run flovart:cli -- init --json
```

The current init contract is reported by:

```bash
npm run flovart:cli -- command.schema --command init --json
```

## Doctor

Run doctor before debugging a setup problem.

```bash
npm run flovart:cli -- doctor --json
```

Doctor must not expose secrets. If provider keys are missing, use browser setup:

```bash
npm run flovart:cli -- provider.begin-setup --purpose both --json
```

## Update Rule

If command documentation and CLI output conflict, treat these as authoritative:

```bash
npm run flovart:cli -- command.list --json
npm run flovart:cli -- command.schema --command <command> --json
```
