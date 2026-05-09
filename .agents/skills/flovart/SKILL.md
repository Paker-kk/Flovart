---
name: flovart
description: Use when operating Flovart as an agent-native image/video runtime through MCP or deterministic CLI tools. External agents handle natural language planning.
---

# Flovart Skill

Flovart is not the planner. The external agent is responsible for scripts, storyboard text, prompts, retries, and final summaries.

## Rules

- Use MCP first; use CLI fallback only when MCP is unavailable.
- Never expose API keys in tool output or chat transcripts.
- Trigger `provider_begin_setup` when keys/models are missing; the user enters secrets in Flovart UI.
- Canvas is media-only: images and videos. Do not create canvas text elements.
- Send explicit prompts and structured JSON to tools.

## Setup

1. `npm run dev`
2. `chrome --remote-debugging-port=9222`
3. Open Flovart in that Chrome window.
4. `npm run flovart:cli -- status --json`
5. `npm run flovart:mcp`

## MCP Tools

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

## One-Sentence User Workflow

1. Inspect runtime/provider state.
2. Open safe provider setup if needed.
3. Derive storyboard prompts in the agent UI.
4. Generate storyboard images through Flovart.
5. Generate video through Flovart.
6. Report results in the agent UI.
