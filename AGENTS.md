# AGENTS.md

## Project

Flovart is a React 19 + TypeScript + Vite AI Canvas Studio. It exposes a local runtime API through `window.__flovartAPI` so coding agents can inspect and operate the active canvas.

## Primary Commands

- Install dependencies: `npm install`
- Run app: `npm run dev`
- Test: `npm test`
- Build: `npm run build`
- External Flovart CLI: `npm run flovart:cli -- status --json`
- MCP server: `node tools/flovart/mcp-server.js`

## Flovart Agent Interface

### CLI Module (OpenCLI-inspired)

```
tools/flovart/
├── cli.js              # Entry point with --format support
├── core.js             # Command execution (backward compatible)
├── formatter.js        # Output: table/json/yaml/csv/md/plain
├── runtime-client.js   # CDP runtime client (unchanged)
├── mcp-server.js       # MCP server (unchanged)
└── commands/           # Split command definitions
    ├── index.js        # Registry loader
    ├── help.js         # help command
    ├── status.js       # status, setup
    ├── provider.js     # provider.* commands
    ├── canvas.js       # canvas.* commands
    ├── asset.js        # asset.list
    ├── generate.js     # generate.* commands
    ├── video.js        # video.status
    └── export.js       # export.project
```

Use `tools/flovart/core.js` as the shared deterministic command registry. Do not add natural-language planning here; external agents handle planning.

Use `tools/flovart/runtime-client.js` for external clients. It connects to Chrome DevTools Protocol on port `9222` and calls the active page's `window.__flovartAPI`.

Use `tools/flovart/cli.js` for deterministic fallback commands with format output support.

   The CLI now supports OpenCLI-inspired features:
   - `--format table|json|yaml|csv|md|plain` for output formatting
   - `--json` / `--yaml` shorthand flags
   - Auto-generated help: `node tools/flovart/cli.js --help`
   - Per-command help: `node tools/flovart/cli.js generate.image --help`
   - Commands organized in `tools/flovart/commands/` (one file per domain)
   - Output formatting via `tools/flovart/formatter.js`
   - Quick scripts: `npm run flovart:help`, `npm run flovart:status`

Use `tools/flovart/mcp-server.js` for MCP hosts. It exposes these tools:

- `flovart.status`
- `flovart.provider_status`
- `flovart.provider_begin_setup`
- `flovart.provider_select_model`
- `flovart.provider_test`
- `flovart.canvas_list_media`
- `flovart.canvas_add_image`
- `flovart.canvas_add_video`
- `flovart.generate_image`
- `flovart.generate_images_batch`
- `flovart.generate_video`
- `flovart.video_status`

## Runtime Setup

Before using external CLI or MCP tools that operate the browser:

1. Start the Vite app with `npm run dev`.
2. Start Chrome with `chrome --remote-debugging-port=9222`.
3. Open Flovart in the debug Chrome window.
4. Verify with `npm run flovart:cli -- status --json`.

## Engineering Rules

- Prefer small, surgical edits.
- Do not add planner logic inside Flovart CLI/MCP. Claude Code/Codex/OpenCode are the planners.
- Do not read or expose API keys through external CLI/MCP outputs.
- Canvas automation is media-only for external agents: images and videos. Do not add text nodes for scripts/storyboards.
- Never commit secrets, `.env`, generated `dist`, or credentials.
- After changing canvas runtime, Flovart CLI, MCP, provider routing, or workflow execution, run `npm run build` and targeted tests when available.
- Keep user-facing copy concise and bilingual only where the touched surface already uses bilingual copy.

## Current Caveats

- `AgentBridgePanel` is a status/instructions panel, not a chat agent or OS shell.
- External CLI and MCP require an active browser tab exposing `window.__flovartAPI`.
- MCP is local stdio only for now, not remote HTTP.
