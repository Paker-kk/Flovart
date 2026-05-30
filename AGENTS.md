# AGENTS.md

## Project

Flovart is a React 19 + TypeScript + Vite AI Canvas Studio. It exposes a local CLI-first file bridge so coding agents can inspect and operate Flovart without Chrome DevTools Protocol or MCP.

## Primary Commands

- Install dependencies: `npm install`
- Run app: `npm run dev`
- Test: `npm test`
- Build: `npm run build`
- External Flovart CLI: `npm run flovart:cli -- status --json`

## Flovart Agent Interface

Use `tools/flovart/core.js` as the shared deterministic command registry. Do not add natural-language planning here; external agents handle planning.

Use `tools/flovart/cli.js` for deterministic commands from Codex, Claude Code, OpenCode, or shell scripts.

Use `tools/flovart/flovart-bridge.js` for the dev-server file bridge. The CLI writes browser-executed commands to `.flovart/command-queue.json`; the Vite app polls `/__flovart/queue`, executes commands through `window.__flovartAPI`, and writes results back.

Use `tools/flovart/shadow-runtime.js` as the local file-state runtime. Canvas, workflow, and provider metadata commands read/write the local state file directly, so they do not require a browser.

## Runtime Setup

1. Run `npm run dev`.
2. Use local data commands directly, e.g. `npm run flovart:cli -- canvas.inspect --json`.
3. For provider-backed commands such as `generate.image`, keep the Flovart browser tab open from the dev server so it can consume queued commands and use browser-only API keys.

## Engineering Rules

- Prefer small, surgical edits.
- Do not add planner logic inside Flovart CLI. Claude Code/Codex/OpenCode are the planners.
- Do not read or expose API keys through external CLI outputs.
- Canvas automation is media-only for external agents: images and videos. Do not add text nodes for scripts/storyboards.
- Never commit secrets, `.env`, generated `dist`, or credentials.
- After changing canvas runtime, Flovart CLI, provider routing, workflow execution, or the file bridge, run `npm run build` and targeted tests when available.
- Keep user-facing copy concise and bilingual only where the touched surface already uses bilingual copy.

## Current Caveats

- `AgentBridgePanel` is a status/instructions panel, not a chat agent or OS shell.
- Provider-backed generation still requires the browser UI because API keys stay in browser storage and must not be exposed to Node CLI.
- The CLI/file bridge is local dev-server based; it is not a remote HTTP service.
