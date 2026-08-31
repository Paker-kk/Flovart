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
npm run flovart:cli -- init --target project-skill --json
```

The current init contract is reported by:

```bash
npm run flovart:cli -- command.schema --command init --json
```

## Doctor（兼容诊断）

`doctor` is a legacy-compatible diagnostic command. Prefer `status`, `host.list`,
and the visible Flovart Settings page for a normal setup; use doctor only when
investigating an older installation.

```bash
npm run flovart:cli -- doctor --json
```

Doctor must not expose secrets. If provider keys are missing, use the browser
Settings page. The following command remains a compatibility bridge:

```bash
npm run flovart:cli -- provider.begin-setup --purpose both --json
```

## Update Rule

If command documentation and CLI output conflict, treat these as authoritative:

```bash
npm run flovart:cli -- command.list --json
npm run flovart:cli -- command.schema --command <command> --json
```
