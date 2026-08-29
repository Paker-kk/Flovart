# 快速开始

五种部署方式，选择适合你的：

## 方式一：本地运行

```bash
git clone https://github.com/avabbbb/Flovart.git
cd Flovart
npm install
npm run dev
```

打开 http://localhost:37522，在设置中填入你的服务凭据即可。

> 推荐 [Google AI Studio](https://aistudio.google.com/apikey) 免费获取 Gemini 凭据。

## 方式二：用外部 Agent / CLI 指挥制作组

Codex、DeepSeek Harness、Claude Code（CC）、OpenCode、Pi 都在 Flovart 的正式支持范围。五者的模型工具都通过 Operation Skill 学会使用同一套本机 CLI；Codex 与 DeepSeek Harness 优先做深度会话/事件连接。Flovart 不向 Coding Agent 暴露 MCP Server，也不要求 Chrome DevTools Protocol、浏览器抓取或文件队列。

> 角色反转仍在迁移中：当前 Desktop 仍保留旧内置主 Agent 入口及其内部 MCP transport。不要把该旧 transport 配成新的外部接入；下述命令只按 `command.list` 中的 `available` 状态使用，也不要把旧界面当作目标架构已经交付。

```bash
npm run flovart:cli -- status --json
npm run flovart:cli -- start --open --json  # 仅在 status 未就绪时执行
npm run flovart:cli -- workspace.status --json
npm run flovart:cli -- workflow.inspect --json
```

### 运行逻辑

- **外部 Harness 是导演台**：保留主对话、总体计划和跨任务调度；关闭 Flovart 不应终止 Harness。
- **Workspace Operator 是唯一内置执行 Agent**：只在单次有界 Intent 内调用类型化、可逆工具；Production Crew 是 Operator、Runtime 与 Worker 的执行面集合名，不是额外 Agent。
- **统一命令注册表**：正常操作使用稳定 Agent surface；仅在 bootstrap、兼容诊断或调试时读取 `command.list` / `command.schema`，并只调用标记为 `available` 的命令。
- **可见 Workflow 单一权威**：节点操作前要求 `workspace.status` 为 `ready`，操作后用 `workflow.inspect` 回读；不得回退到旧 Canvas、shadow state、CDP、私有 HTTP 或 `.flovart/command-queue.json`。
- **密钥安全**：Provider Secret 只由 Flovart 的受控边界使用，CLI 与外部 Agent 均不得读取、输出或保存原始密钥。

### 示例命令

```bash
npm run flovart:cli -- workflow.project.list --json
npm run flovart:cli -- workflow.node.create --id shot-01 --type text --title "镜头 01" --x 120 --y 160 --metadata-json '{"content":"开场镜头说明"}' --idempotency-key create-shot-01-v1 --json
npm run flovart:cli -- workflow.inspect --json
```

命令注册表可以离线读取；可见节点命令需要先启动 Flovart Desktop、打开目标 Workflow，并确认 Workspace Adapter 已连接。完整架构边界见 [Agent 设计文档](../design/agent/README.md)。

DeepSeek Harness 的目标体验是在自身主壳中安装专用 Flovart Profile/Plugin：左侧固定 Flovart Dock 打开中央完整 Workflow、Table 与 Agent Production Control，快速弹层处理审批/状态/Artifact，右侧 Agent Bridge 管理连接与单导演 Handoff，并可弹出独立 Flovart 窗口。Host Plugin 仍从 CLI Registry 派生并执行模型工具，Client Plugin 只为 UI、事件和恢复使用受限本地通道。该 Profile 尚处于设计/迁移阶段；当前使用方式仍以 Operation Skill + CLI + 独立 Flovart 工作区为准。

## 方式三：第三方服务适配

Flovart 正在持续推进 **OpenAI-compatible** 第三方端点（如中转站、企业内网网关）适配。你可以在设置中选择 **自定义 Provider**，按以下方式接入：

1. **Base URL** — 填入你的端点地址（如 `https://api.example.com/v1/chat/completions`，Flovart 会自动裁剪到 `/v1`）
2. **服务凭据** — 填入你的访问凭据
3. **模型名** — 选择或手动输入当前 Provider 已返回的模型（如 `gemini-3.1-flash-image`、`gpt-image-2`）
4. **能力声明** — 勾选该凭据支持的能力（图片 / 视频 / 文本），自定义模型会按此归类到下拉菜单

> **适配说明**：第三方兼容规则仍在持续迭代中。欢迎你一起完善适配规则与样例，帮助更多模型服务稳定接入。

### 支持的图片响应格式

- 标准 `b64_json`（OpenAI 原生格式）
- `data:image/...;base64,...` 完整 Data URL
- HTTPS 远程图片 URL
- Chat Completions 返回的 Markdown 图片链接（`![](https://...)`）

## 方式四：Docker 本地联调

```bash
git clone https://github.com/avabbbb/Flovart.git
cd Flovart
docker compose up --build -d
```

访问 http://localhost:1635。

当前 Compose 只用于 Web、Hub、Enterprise 与 PostgreSQL 的本地联调；静态资源生产路径、安全配置和正式部署尚未完成验收，不能据此宣称生产部署已就绪。

## 方式五：浏览器扩展

> 🔜 **正在准备上架 Chrome / Edge 商店，Coming Soon。**
>
> 当前可通过开发者模式加载：

```bash
npm run ext:build
```

1. 打开 `chrome://extensions/` 或 `edge://extensions/`
2. 开启「开发人员模式」
3. 点击「加载已解压的扩展程序」→ 选择 `dist-extension/` 目录

正式商店安装、权限和 Desktop 配对指南尚未发布；当前只按上述开发者模式步骤测试。
