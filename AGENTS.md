# AGENTS.md

## Project

Flovart is a React 19 + TypeScript + Vite AI Canvas Studio. It exposes a local runtime API through `window.__flovartAPI` so coding agents can inspect and operate the active canvas.

## Primary Commands

- Install dependencies: `npm install`
- Run app: `npm run dev`
- Test: `npm test`
- Build: `npm run build`
- External Flovart CLI: `npm run flovart:cli -- "帮我画一个猫咪吃汉堡的"`
- MCP server: `node tools/flovart/mcp-server.js`

## Flovart Agent Interface

Use `tools/flovart/core.js` as the shared planner/router. Do not create separate command-routing logic in UI, CLI, and MCP.

Use `tools/flovart/runtime-client.js` for external clients. It connects to Chrome DevTools Protocol on port `9222` and calls the active page's `window.__flovartAPI`.

Use `tools/flovart/cli.js` for one-shot external tasks from Codex, Claude Code, OpenCode, or shell scripts.

Use `tools/flovart/mcp-server.js` for MCP hosts. It exposes these tools:

- `flovart.run`
- `flovart.status`
- `flovart.canvas_list`
- `flovart.canvas_add_text`
- `flovart.generate_image`

## Runtime Setup

Before using external CLI or MCP tools that operate the browser:

1. Start the Vite app with `npm run dev`.
2. Start Chrome with `chrome --remote-debugging-port=9222`.
3. Open Flovart in the debug Chrome window.
4. Verify with `npm run flovart:cli -- status`.

## Engineering Rules

- Prefer small, surgical edits.
- Do not duplicate planner logic across UI, CLI, and MCP.
- Do not read or expose API keys through external CLI/MCP outputs.
- Never commit secrets, `.env`, generated `dist`, or credentials.
- After changing canvas runtime, Flovart CLI, MCP, provider routing, or workflow execution, run `npm run build` and targeted tests when available.
- Keep user-facing copy concise and bilingual only where the touched surface already uses bilingual copy.

## Current Caveats

- `FlovartCliPanel` is an in-app runtime shell, not an OS shell.
- External CLI and MCP require an active browser tab exposing `window.__flovartAPI`.
- MCP is local stdio only for now, not remote HTTP.
