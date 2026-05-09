---
name: flovart
description: Use when Claude Code needs to operate Flovart as an agent-native media runtime through MCP/CLI. Flovart generates and manages images/videos only; Claude Code handles scripts, storyboards, prompts, and planning.
---

# Flovart Skill

Flovart is a deterministic media runtime, not an AI agent. You are the planner.

## Runtime Setup

1. Run `npm run dev`.
2. Launch Chrome with `chrome --remote-debugging-port=9222`.
3. Open Flovart in that Chrome window.
4. Verify with `npm run flovart:cli -- status --json`.
5. Start MCP with `npm run flovart:mcp`.

## Rules

- Never ask the user to paste API keys into Claude Code.
- If a provider is missing, call `flovart.provider_begin_setup` and tell the user to enter keys in the Flovart browser UI.
- Do all script/storyboard/prompt text work inside Claude Code.
- Do not add text nodes to the Flovart canvas.
- Flovart canvas is media-only: images and videos.
- Prefer MCP tools. Use `npm run flovart:cli -- <command> --json` only as fallback.
- Keep all tool calls explicit and JSON-safe.

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

## Storyboard/Image/Video Workflow

When the user asks for video/script/storyboard generation:

1. Call `flovart.status`.
2. Call `flovart.provider_status`.
3. If image or video provider is missing, call `flovart.provider_begin_setup` with `purpose: "both"`.
4. Convert the user's script into shot prompts in Claude Code.
5. Call `flovart.generate_images_batch` with explicit prompts.
6. Retry only failed shots with improved prompts.
7. Call `flovart.generate_video` with the generated media references and an explicit motion prompt.
8. Summarize results in Claude Code, not on the Flovart canvas.

## CLI Fallback Examples

```bash
npm run flovart:cli -- status --json
npm run flovart:cli -- provider.status --json
npm run flovart:cli -- provider.begin-setup --provider gemini --purpose both --json
npm run flovart:cli -- generate.image --prompt "cinematic storyboard frame" --json
npm run flovart:cli -- generate.images-batch --file shots.json --json
```
