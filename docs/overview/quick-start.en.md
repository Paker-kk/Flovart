# Getting Started

Five deployment options — pick the one that fits you:

## Option 1: Run Locally

```bash
git clone https://github.com/avabbbb/Flovart.git
cd Flovart
npm install
npm run dev
```

Open http://localhost:37522 and enter your service credentials in Settings.

> We recommend [Google AI Studio](https://aistudio.google.com/apikey) to get free Gemini credentials.

## Option 2: Direct the Production Crew via an External Agent / CLI

Codex, DeepSeek Harness, Claude Code (CC), OpenCode, and Pi are all in Flovart's official support scope. Their model tools learn the same local CLI through an Operation Skill; Codex and DeepSeek Harness receive deeper session/event integration first. Flovart exposes no MCP server to coding agents and requires no Chrome DevTools Protocol, browser scraping, or file queue.

> The role reversal is still being migrated: Desktop currently retains the older built-in-main-agent entry and its internal MCP transport. Do not configure that legacy transport as a new external integration. Use only commands marked `available` by `command.list`, and do not treat the old UI as proof that the target architecture has shipped.

```bash
npm run flovart:cli -- status --json
npm run flovart:cli -- start --open --json  # only when status is not ready
npm run flovart:cli -- workspace.status --json
npm run flovart:cli -- workflow.inspect --json
```

### How it Works

- **The external harness is the director**: it owns the canonical conversation, overall plan, and cross-task scheduling; closing Flovart must not terminate it.
- **Workspace Operator is the only built-in execution agent**: it calls typed, reversible tools only inside a bounded intent. Production Crew is merely the group name for the Operator, Runtime, workers, and tools—not another agent.
- **One command registry**: normal work uses the stable Agent surface; read `command.list` / `command.schema` only for bootstrap, compatibility diagnosis, or debugging, and call only commands marked `available`.
- **One visible-Workflow authority**: require `workspace.status` to be `ready`, then verify every mutation with `workflow.inspect`. Never fall back to the old Canvas, shadow state, CDP, private HTTP, or `.flovart/command-queue.json`.
- **Secret boundary**: Provider secrets stay in Flovart's controlled boundary. The CLI and external harness never read, print, or store raw secrets.

### Example Commands

```bash
npm run flovart:cli -- workflow.project.list --json
npm run flovart:cli -- workflow.node.create --id shot-01 --type text --title "Shot 01" --x 120 --y 160 --metadata-json '{"content":"Opening shot notes"}' --idempotency-key create-shot-01-v1 --json
npm run flovart:cli -- workflow.inspect --json
```

The command registry is readable offline. Visible-node commands require Flovart Desktop to be running, the target Workflow to be open, and the Workspace Adapter to report ready. See the [Agent architecture package](../design/agent/README.md) for the full boundary.

The target DeepSeek Harness experience installs a dedicated Flovart Profile/Plugin into the Harness shell. A fixed Flovart Dock opens the complete Workflow, Table, and Agent Production Control surface in the central workspace; lightweight overlays handle approvals/status/artifacts, the right-side Agent Bridge manages connections and single-director handoff, and a standalone Flovart window remains available. The Host Plugin still derives and executes model tools from the CLI registry; its Client Plugin uses a scoped local channel only for UI, events, and recovery. This Profile is still a design/migration target, so the current path remains Operation Skill + CLI + the standalone Flovart workspace.

## Option 3: Third-Party Service Adaptation

Flovart is continuously advancing **OpenAI-compatible** third-party endpoint adaptation (e.g., relay stations, enterprise intranet gateways). You can select **Custom Provider** in Settings and connect it as follows:

1. **Base URL** — Enter your endpoint address (e.g., `https://api.example.com/v1/chat/completions`; Flovart trims it to `/v1` automatically).
2. **Service credentials** — Enter your access credentials.
3. **Model name** — Select or enter a model returned by the current provider (for example, `gemini-3.1-flash-image` or `gpt-image-2`).
4. **Capability declaration** — Check the capabilities your credential supports (image / video / text); custom models are categorized into the dropdown accordingly.

> **Note on adaptation**: Third-party compatibility rules are still iterating. You are welcome to help improve the adaptation rules and samples so more model services can integrate reliably.

### Supported Image Response Formats

- Standard `b64_json` (OpenAI native format)
- Full Data URL `data:image/...;base64,...`
- HTTPS remote image URL
- Markdown image links returned by Chat Completions (`![](https://...)`)

## Option 4: Docker Local Integration

```bash
git clone https://github.com/avabbbb/Flovart.git
cd Flovart
docker compose up --build -d
```

Visit http://localhost:1635.

The current Compose stack is for local Web, Hub, Enterprise, and PostgreSQL integration only. Static production assets, security settings, and deployment have not completed release acceptance and must not be presented as production-ready.

## Option 5: Browser Extension

> 🔜 **Preparing for the Chrome / Edge store — Coming Soon.**
>
> For now, load it via developer mode:

```bash
npm run ext:build
```

1. Open `chrome://extensions/` or `edge://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" → select the `dist-extension/` directory

The store-installation, permission, and Desktop-pairing guide has not been published yet; use the developer-mode steps above for current testing.
