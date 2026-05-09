---
name: flovart
description: Use when operating or extending Flovart AI Canvas Studio, including natural-language canvas operations, FlovartCli, MCP integration, external Codex/Claude/OpenCode control, runtime tools, provider routing, and canvas workflow automation.
---

# Flovart Skill

Use this skill for Flovart agent operations and code changes.

## Preferred Interfaces

- In-app shell: right panel `FlovartCli`
- External one-shot CLI: `npm run flovart:cli -- "<natural language task>"`
- MCP server: `node tools/flovart/mcp-server.js`
- Shared planner/router: `tools/flovart/core.js`
- External browser runtime client: `tools/flovart/runtime-client.js`

## Runtime Setup

1. Run `npm run dev`.
2. Launch Chrome with `chrome --remote-debugging-port=9222`.
3. Open Flovart in that Chrome window.
4. Verify with `npm run flovart:cli -- status`.

## MCP Tools

- `flovart.run`: natural-language or explicit Flovart task
- `flovart.status`: runtime and session status
- `flovart.canvas_list`: list canvas elements
- `flovart.canvas_add_text`: add text to canvas
- `flovart.generate_image`: generate image from prompt

## Rules

- Do not duplicate command-routing logic. Update `tools/flovart/core.js` first.
- Keep external CLI/MCP outputs JSON-safe and secret-free.
- Treat the browser runtime as the action boundary. Do not expose raw API keys.
- Run `npm run build` after changing UI, runtime, CLI, or MCP code.
