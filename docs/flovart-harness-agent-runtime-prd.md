# Flovart Harness Agent Runtime PRD

状态：Draft 1
日期：2026-05-11
目标版本：MVP / P0
适用范围：Flovart 本地 AI Canvas Studio、CLI、MCP、Browser Runtime Bridge、Skill 体系

## 1. Reality Sync

### 1.1 当前已验证事实

本 PRD 以当前仓库为准，已在本地验证到以下事实：

- `AGENTS.md` 将 Flovart 定义为 React 19 + TypeScript + Vite AI Canvas Studio，并通过 `window.__flovartAPI` 暴露本地 runtime API。
- 当前 Agent 接口要求 `tools/flovart/core.js` 作为确定性命令注册中心，不允许在 CLI/MCP 中加入自然语言 planning。
- 当前外部入口包含 CLI、MCP server、Chrome DevTools Runtime Client。
- 当前 MCP 已暴露 `flovart.status`、provider status/setup/test、canvas add/list media、image/video generation、video status 等工具。
- 当前工程规则明确要求不通过 CLI/MCP 暴露 API key，不提交 secrets，不把 `AgentBridgePanel` 做成聊天 agent 或 OS shell。
- `skills/flovart/SKILL.md` 已存在 LibTV、RunningHub、FFmpeg、Remotion 等协作矩阵，并描述了 `window.__flovartAPI` 的 Phase 2 Runtime API。

### 1.2 当前未在仓库验证到的材料

用户提供的方向中提到以下外部或历史依据，本 PRD 将其作为产品参考，而不是已在本仓库验证的既定事实：

- `docs/superpowers/plans/2026-04-20-claude-agent-skill-integration-phase7.md`：当前 `docs/` 为空，未在本仓库找到该文件。
- LibTV 官方 skill 仓库的 `SKILL.md + scripts/`、`create_session -> query_session -> download_results` 链路：本 PRD 采纳为参考模式，但后续实现前需要补充来源链接或重新联网复核。
- TapNow 的产品形态、GPLv3 许可证、工作流能力：本 PRD 采纳“借鉴产品结构、不复制代码”的约束，但后续实现前需要补充来源链接或重新联网复核。
- Martin Fowler Harness Engineering、Inngest Utah Harness：本 PRD 采纳 feedforward/feedback、guides/sensors、durable steps、trace、sub-agent isolation 等设计原则，但不把它们作为 MVP 的技术依赖。

### 1.3 严格结论

Flovart 不应该升级成“大而全 Agent 框架”。如果把它做成更多脚本、更复杂 CLI、更多 UI 面板，只会让接口更混乱。

Flovart 应该升级成专用 Harness Runtime：外部 Agent 负责理解、规划、提示词和多轮修正；Flovart 负责稳定动作协议、状态协议、结果协议、权限边界、任务生命周期和可观测输出。

## 2. 产品定义

### 2.1 产品名

Flovart Harness Agent Runtime

### 2.2 一句话定义

Flovart 是一个面向 Claude Code / OpenCode / Codex / MCP / Skill 的 AI 创作 Harness Runtime，提供稳定的技能发现、动作协议、会话状态、媒体画布、生成任务和结果追踪能力，让外部 Agent 只负责规划，让 Flovart 负责执行、约束、观测和沉淀。

### 2.3 产品目标

- 把 Flovart 从“可被脚本操控的 AI 画布”升级为“Agent 可调用的创作运行时”。
- 把 Skill 从“脚本说明文档”升级为“可发现、可校验、可授权、可追踪、可复用的能力包”。
- 把 CLI、MCP、Runtime Bridge 的返回格式统一为可被 Agent 稳定消费的协议。
- 把长任务、批量生成、导入外部结果、画布放置等能力纳入统一 session/job/trace 生命周期。
- 避免把自然语言 planning、聊天逻辑、OS shell 能力塞进 Flovart 内部。

### 2.4 非目标

- 不做通用 Agent Framework。
- 不内置完整聊天 Agent。
- 不在 `tools/flovart/core.js`、CLI、MCP 中加入自然语言 planning。
- 不让外部 Agent 直接读写底层 React state、provider secret 或内部不稳定结构。
- 不复制 TapNow 或任何 GPLv3 项目的代码。
- 不在 MVP 阶段建设 marketplace、远程 SaaS Harness、复杂 DAG 引擎或完整权限沙箱。

## 3. 目标用户

### 3.1 Claude Code / OpenCode / Codex 用户

他们需要通过 MCP/CLI 调用 Flovart，把自然语言任务变成图片、视频、分镜、资产和画布结果。

核心诉求：稳定动作协议、清晰错误、可查询 job、可复用结果引用。

### 3.2 多模态创作者

他们需要把图片生成、视频生成、分镜、工作流、外部平台结果导入串成可重复流程。

核心诉求：少手动搬运、结果可见、失败可恢复、素材可沉淀。

### 3.3 Skill 作者

他们需要为 Flovart 提供可被 Agent 自动发现和调用的能力包。

核心诉求：低门槛目录规范、清楚输入输出、权限声明、脚本可测试。

### 3.4 平台方或高级集成者

他们希望像 LibTV 类平台一样提供 Agent 入口，或把 Flovart 接入更大的创作自动化系统。

核心诉求：OpenAPI/MCP/Skill 双向兼容、会话式生成、长任务轮询、输出下载和导入。

## 4. 核心问题

### 4.1 当前问题

- Runtime API、CLI、MCP、Skill 脚本容易各自定义返回结构，Agent 难以稳定消费。
- 生成图片、生成视频、批量任务、外部导入缺少统一 job lifecycle。
- 长任务失败后缺少标准错误码、trace、可恢复机制和幂等保护。
- Skill 能力越来越多，但缺少 registry、manifest、权限声明和版本边界。
- Canvas、Workflow、Storyboard、Assets 容易变成互相绕开的状态孤岛。
- Provider 能力、模型选择、输出类型、导入类型可能散落在 UI 或脚本里。

### 4.2 不解决这些问题的后果

- Agent 调用会变成 fragile glue code，每个工具都要单独适配。
- 失败无法定位，用户只看到“没生成”或“脚本报错”。
- 批量生成可能重复扣费、重复导入、重复写入画布。
- Skill 越多越不可控，最终成为脚本垃圾桶。
- Flovart 失去作为创作 runtime 的核心价值，只剩画布 UI。

## 5. 产品原则

### 5.1 薄 Harness，胖 Skill

Harness 只提供协议、状态、权限、路由、trace、job lifecycle 和稳定 action surface。复杂领域逻辑留给 Skill 或 product domain 实现。

### 5.2 外部 Agent 规划，Flovart 执行

Claude Code、OpenCode、Codex 负责自然语言理解、任务拆解、提示词生成、工具选择和总结。Flovart 只接收结构化 action request，返回结构化 action response。

### 5.3 所有外部动作必须可观测

每个 action 都必须有 `requestId`、`sessionId`、`traceId`，长任务必须有 `jobId` 和可查询状态。

### 5.4 所有输出必须引用化

MCP/CLI 不直接输出 secret、内部完整对象、超大 base64 或不稳定 React state。输出统一通过 `outputRefs` 返回 `elementIds`、`assetIds`、`shotIds`、`jobIds`。

### 5.5 先协议，后功能

在 P0 阶段，优先统一 action/result envelope、job lifecycle、错误码和 registry。不要先堆更多脚本。

## 6. 系统边界

### 6.1 Flovart 负责

- Harness Runtime
- Skill Manifest 与本地 Skill Registry
- Runtime Action Protocol
- Session / Job / Trace / Log / Error 管理
- Canvas / Workflow / Storyboard / Assets / Generate 产品域 action
- MCP / CLI / Browser Runtime Bridge
- Provider 能力查询和生成任务路由
- 输出引用和结果落盘/落画布

### 6.2 外部 Agent 负责

- 自然语言理解
- 任务拆解
- 提示词生成
- Skill/action 调用决策
- 多轮修正
- 最终总结和用户沟通

### 6.3 Skill 负责

- 领域能力封装
- 外部服务调用
- 输入输出转换
- 可测试脚本
- 自身权限、依赖、版本说明

## 7. 目标架构

```text
Claude Code / OpenCode / Codex / External Agent
  -> MCP / CLI / Skill Host
  -> Flovart Harness Layer
       - skill registry
       - action router
       - session manager
       - permission guard
       - job lifecycle
       - trace / logs / output refs
  -> Flovart Action SDK
       - canvas.describe
       - generate.image
       - workflow.run
       - storyboard.createShot
       - assets.attachToCanvas
  -> Runtime Bridge
       - window.__flovartAPI
       - Chrome DevTools Protocol client
       - browser extension bridge
  -> Product Domains
       - Canvas
       - Workflow
       - Storyboard
       - Assets
       - Generate
```

## 8. 核心产品域

### 8.1 Canvas

Canvas 是最终可视化承载层，只允许外部 Agent 通过高层 action 操作媒体元素。

P0 目标：描述画布、列出媒体、添加图片、添加视频、放置生成结果。

### 8.2 Generate

Generate 是图片、批量图片、视频生成任务入口。

P0 目标：所有生成都进入 job lifecycle，所有结果通过 output refs 返回。

### 8.3 Assets

Assets 是媒体资源沉淀层，避免把大媒体全部塞进 localStorage 或 CLI 输出。

P0 目标：保存资源、列出资源、把资源附加到画布。

### 8.4 Workflow

Workflow 是结构化创作流程层，MVP 只做描述和导入，不做完整 DAG 引擎。

P0 目标：暴露 `workflow.describe`、`workflow.importJson`，P1 再考虑 `workflow.run`。

### 8.5 Storyboard

Storyboard 是脚本/小说/分镜到批量生成的中间结构。

P0 目标：建立 project/shot 数据模型，允许 shot 绑定生成输出。

## 9. MVP 功能范围

### 9.1 P0 必须完成

- 定义 `FlovartActionRequest`。
- 定义 `FlovartActionResponse`。
- 所有 MCP/CLI/runtime 命令统一返回 envelope。
- 新增 `canvas.describe`。
- 新增 `session.create`、`session.get`、`session.list`。
- 新增 `job.status`。
- 新增本地 Skill Registry，扫描 `skills/**/SKILL.md`。
- 将现有 `generate.image`、`generate.images_batch`、`generate.video` 接入 job lifecycle。
- 修正 LibTV 导入脚本的视频导入类型，视频分支不得继续使用 `type: 'image'`。
- 所有外部输出只返回 ref、摘要和安全元数据，不返回 API key、完整 secret 或超大 base64。

### 9.2 P1 应该完成

- Skill 权限声明和 allowlist。
- Skill manifest 版本字段、依赖字段、入口脚本字段。
- Workflow JSON 导入作为 action 暴露。
- Storyboard shot 数据结构和批量生成链路。
- Runtime trace 面板。
- Provider capability matrix。
- 失败重试策略。
- `idempotencyKey` 幂等支持。
- 外部结果导入统一 action 化。

### 9.3 P2 可以探索

- Sub-agent handoff 文件规范。
- 事件驱动 job queue。
- 人工确认 gate。
- Skill marketplace/install。
- 多 provider fallback 策略。
- 远程 Harness 服务。
- 更完整的 workflow DAG runtime。

## 10. Action Protocol

### 10.1 Request Envelope

```json
{
  "requestId": "uuid",
  "sessionId": "uuid",
  "traceId": "uuid",
  "source": "claude-code|opencode|codex|skill|mcp|cli|extension|runtime",
  "action": "canvas.describe",
  "target": {
    "domain": "canvas|workflow|storyboard|assets|generate|session|job|provider|skill"
  },
  "payload": {},
  "meta": {
    "timeoutMs": 60000,
    "idempotencyKey": "optional",
    "dryRun": false
  }
}
```

### 10.2 Response Envelope

```json
{
  "ok": true,
  "requestId": "uuid",
  "sessionId": "uuid",
  "traceId": "uuid",
  "status": "accepted|running|succeeded|failed|canceled",
  "progress": {
    "pct": 100,
    "stage": "completed"
  },
  "result": {},
  "outputRefs": {
    "elementIds": [],
    "assetIds": [],
    "shotIds": [],
    "jobIds": []
  },
  "error": null
}
```

### 10.3 Error Envelope

```json
{
  "ok": false,
  "requestId": "uuid",
  "sessionId": "uuid",
  "traceId": "uuid",
  "status": "failed",
  "progress": {
    "pct": 0,
    "stage": "failed"
  },
  "result": null,
  "outputRefs": {
    "elementIds": [],
    "assetIds": [],
    "shotIds": [],
    "jobIds": []
  },
  "error": {
    "code": "RUNTIME_NOT_CONNECTED",
    "message": "Flovart runtime is not connected.",
    "details": {},
    "retryable": true
  }
}
```

### 10.4 协议要求

- `requestId` 由调用方或 Harness 生成，用于单次请求追踪。
- `sessionId` 表示一组相关动作，可跨多个 job。
- `traceId` 表示端到端调用链，必须写入 logs。
- `source` 必须标识调用来源。
- `action` 必须使用稳定字符串，不允许 UI 文案作为 action name。
- `result` 只放小型结构化摘要。
- `outputRefs` 放所有可复用输出引用。
- `error.code` 必须使用标准错误码。

## 11. 首批 Action 清单

### 11.1 Session

| Action | P0 | 描述 |
| --- | --- | --- |
| `session.create` | 是 | 创建 harness session |
| `session.get` | 是 | 查询单个 session |
| `session.list` | 是 | 列出近期 sessions |
| `session.close` | 否 | 关闭 session，P1 考虑 |

### 11.2 Job

| Action | P0 | 描述 |
| --- | --- | --- |
| `job.status` | 是 | 查询 job 当前状态 |
| `job.cancel` | 否 | 取消 job，P1 考虑 |
| `job.retry` | 否 | 重试 job，P1 考虑 |
| `job.list` | 否 | 列出 session 下 jobs，P1 考虑 |

### 11.3 Canvas

| Action | P0 | 描述 |
| --- | --- | --- |
| `canvas.describe` | 是 | 返回画布摘要、媒体计数、选中状态、视图状态 |
| `canvas.listMedia` | 是 | 列出画布图片/视频元素摘要 |
| `canvas.addImage` | 是 | 添加图片到画布 |
| `canvas.addVideo` | 是 | 添加视频到画布 |
| `canvas.placeGeneratedResult` | 是 | 将生成结果放入画布 |

### 11.4 Generate

| Action | P0 | 描述 |
| --- | --- | --- |
| `generate.image` | 是 | 生成单张图片 |
| `generate.imagesBatch` | 是 | 批量生成图片 |
| `generate.video` | 是 | 生成视频 |
| `generate.status` | 是 | 查询生成任务状态，内部可映射到 `job.status` |

### 11.5 Workflow

| Action | P0 | 描述 |
| --- | --- | --- |
| `workflow.describe` | 是 | 返回 workflow 能力和当前状态摘要 |
| `workflow.importJson` | 是 | 导入 workflow JSON |
| `workflow.run` | 否 | 执行 workflow，P1 或 P2 再做 |

### 11.6 Storyboard

| Action | P0 | 描述 |
| --- | --- | --- |
| `storyboard.createProject` | 是 | 创建 storyboard project |
| `storyboard.createShot` | 是 | 创建 shot |
| `storyboard.attachOutput` | 是 | 把生成输出绑定到 shot |
| `storyboard.listShots` | 是 | 查询 shots |

### 11.7 Assets

| Action | P0 | 描述 |
| --- | --- | --- |
| `assets.list` | 是 | 列出 assets |
| `assets.save` | 是 | 保存媒体资源 |
| `assets.attachToCanvas` | 是 | 把 asset 添加到画布 |

### 11.8 Skill

| Action | P0 | 描述 |
| --- | --- | --- |
| `skill.list` | 是 | 列出本地可发现 skills |
| `skill.describe` | 是 | 查看单个 skill manifest 摘要 |
| `skill.invoke` | 否 | P1 再开放，P0 先做 registry 和 manifest |

## 12. Session / Job / Trace

### 12.1 Session 模型

```json
{
  "sessionId": "uuid",
  "createdAt": "iso-date",
  "updatedAt": "iso-date",
  "source": "claude-code",
  "title": "Generate storyboard images",
  "status": "active|closed|failed",
  "jobIds": [],
  "outputRefs": {
    "elementIds": [],
    "assetIds": [],
    "shotIds": [],
    "jobIds": []
  }
}
```

### 12.2 Job 状态机

```text
created -> accepted -> running -> succeeded
                       -> failed -> retrying -> running
                       -> canceled
```

### 12.3 Job 模型

```json
{
  "jobId": "uuid",
  "sessionId": "uuid",
  "traceId": "uuid",
  "action": "generate.image",
  "status": "created|accepted|running|succeeded|failed|retrying|canceled",
  "progress": {
    "pct": 0,
    "stage": "queued"
  },
  "createdAt": "iso-date",
  "updatedAt": "iso-date",
  "startedAt": null,
  "finishedAt": null,
  "retryCount": 0,
  "idempotencyKey": "optional",
  "outputRefs": {
    "elementIds": [],
    "assetIds": [],
    "shotIds": [],
    "jobIds": []
  },
  "error": null
}
```

### 12.4 Trace 要求

- 每个 request 都必须能通过 `traceId` 查到 action、source、session、job、错误和输出引用。
- P0 可以先写入内存或本地轻量持久化。
- P1 再做 Runtime Trace Panel。
- Trace 不得包含 API key、完整 headers、完整 provider secret。

## 13. 错误码

### 13.1 P0 标准错误码

| Code | Retryable | 描述 |
| --- | --- | --- |
| `BAD_REQUEST` | 否 | 请求结构、payload 或 action 参数错误 |
| `UNAUTHORIZED` | 否 | 未授权调用或权限不足 |
| `PROVIDER_UNAVAILABLE` | 是 | Provider 不可用、未配置或暂时失败 |
| `RATE_LIMITED` | 是 | Provider 或本地队列限流 |
| `PAYLOAD_TOO_LARGE` | 否 | 输入过大，不能通过当前通道传输 |
| `TIMEOUT` | 是 | 操作超时 |
| `RUNTIME_NOT_CONNECTED` | 是 | 浏览器 runtime 未连接或 `window.__flovartAPI` 不可用 |
| `SKILL_NOT_FOUND` | 否 | 找不到目标 skill |
| `ACTION_NOT_ALLOWED` | 否 | action 不在 allowlist 或权限不足 |
| `INTERNAL_ERROR` | 是 | 未分类内部错误 |

### 13.2 错误处理要求

- 不允许向 MCP/CLI 返回裸字符串错误。
- 不允许吞掉 provider 错误后只返回 `failed`。
- 对可重试错误必须标记 `retryable: true`。
- 对用户可修复错误必须提供简短 `message`。
- `details` 必须脱敏。

## 14. Skill Manifest 与 Registry

### 14.1 目录结构

```text
skills/
  flovart/
    SKILL.md
    scripts/
  libtv-import/
    SKILL.md
    scripts/
```

### 14.2 Manifest 示例

```yaml
name: flovart-libtv-import
version: 0.1.0
description: Import LibTV generated images/videos into Flovart canvas.
triggers:
  - libtv
  - import generated video
  - import generated images
permissions:
  - canvas:write
  - assets:write
  - network:libtv
inputs:
  sessionId:
    type: string
    required: true
outputs:
  elementIds:
    type: string[]
```

### 14.3 P0 Registry 行为

- 扫描 `skills/**/SKILL.md`。
- 提取最小 manifest：`name`、`version`、`description`、`triggers`、`permissions`、`inputs`、`outputs`。
- 输出 `skill.list` 和 `skill.describe` 所需摘要。
- 不执行任意脚本。
- 不做 marketplace。
- 不读取 `.env`、API key 或 secret。

### 14.4 P1 Registry 行为

- 校验 manifest schema。
- 支持 `entrypoints`。
- 支持依赖声明。
- 支持权限 allowlist。
- 支持 `skill.invoke` 的受控执行。

## 15. TapNow 借鉴边界

### 15.1 可以借鉴

- 多工作区：Canvas / Workflow / Storyboard / Assets。
- 节点工作流：输入、处理、输出、预览。
- 智能分镜：小说/脚本拆成 shot，再批量生成。
- 本地缓存：媒体资源不要全部塞进 localStorage。
- 模型库：provider/model 能力矩阵可视化。
- 长任务：轮询、超时、失败回填、结果聚合。

### 15.2 不允许借鉴

- 不复制 GPLv3 代码。
- 不照搬状态结构。
- 不把 provider 适配散落在 UI 组件里。
- 不让每个节点自定义一套结果格式。
- 不让 workflow runtime 在 MVP 中膨胀成大而全 DAG 系统。

## 16. LibTV 借鉴边界

### 16.1 可以吸收

- `SKILL.md + scripts/` 的能力包结构。
- 会话式生成链路：create session、query session、download results。
- Agent 自动识别与调用，不要求用户手动跑脚本。
- 输出本地文件路径、远端项目链接、媒体 URL、asset refs。
- 复杂任务允许长时间轮询。

### 16.2 不应该复制

- LibTV 偏平台服务，Flovart 是本地/浏览器 runtime。
- LibTV 核心偏自然语言 IM，Flovart 核心应该是 Action Protocol。
- LibTV 可让后端 Agent 编排，Flovart 应让 Claude Code/OpenCode/Codex 编排，自己只做 harness。

## 17. 安全与权限

### 17.1 P0 安全底线

- MCP/CLI 输出不得包含 API key。
- Error details 和 trace logs 必须脱敏。
- 不允许外部 Agent 直接读取 provider secret。
- 不允许通过 Skill Registry 执行任意脚本。
- Canvas automation 对外仍以媒体为主，不新增 text node 脚本/storyboard 操作。

### 17.2 P1 权限模型

| Permission | 描述 |
| --- | --- |
| `canvas:read` | 读取画布摘要和媒体列表 |
| `canvas:write` | 添加或更新画布媒体元素 |
| `assets:read` | 读取 assets 摘要 |
| `assets:write` | 保存或导入 assets |
| `generate:image` | 调用图片生成 |
| `generate:video` | 调用视频生成 |
| `workflow:read` | 读取 workflow 摘要 |
| `workflow:write` | 导入或修改 workflow |
| `storyboard:write` | 创建 project/shot 或绑定输出 |
| `network:libtv` | 访问 LibTV 相关网络能力 |
| `network:runninghub` | 访问 RunningHub 相关网络能力 |

## 18. 数据与持久化

### 18.1 P0 持久化策略

- Session/job/trace 可以先使用内存存储，必要时落到本地 JSON 或 IndexedDB。
- Media asset 不应通过 MCP/CLI 直接传输大 base64。
- 生成结果优先保存为 asset，再通过 `assetId` 或 `elementId` 引用。
- `outputRefs` 是跨 Canvas、Storyboard、Workflow、Assets 的统一关联层。

### 18.2 P1 持久化策略

- 引入稳定的 asset metadata store。
- 支持 job 恢复和历史查询。
- 支持 trace 面板和日志筛选。
- 支持 asset 清理策略。

## 19. Provider 能力矩阵

### 19.1 P0 要求

- 能查询 provider 是否可用。
- 能查询当前可用 image/video generation 能力。
- 不向外输出 provider secret。
- 生成 action 在 provider 不可用时返回 `PROVIDER_UNAVAILABLE`。

### 19.2 P1 要求

- 展示 provider/model capability matrix。
- 标明 image/video、尺寸、批量、时长、输入媒体、费用或速率限制等能力。
- 支持 Agent 根据能力选择 action 参数，但最终 routing 仍由 Flovart 校验。

## 20. 典型用户流程

### 20.1 状态查询

1. 用户要求 Agent 检查当前 Flovart 状态。
2. Agent 调用 `flovart.status` 或统一 action `runtime.status`。
3. Flovart 返回 session、provider、runtime connection、media count 摘要。
4. Agent 根据状态决定是否继续生成或提示用户启动浏览器 runtime。

### 20.2 单图生成并放入画布

1. Agent 创建 session。
2. Agent 调用 `generate.image`。
3. Flovart 创建 job，进入 `accepted` 和 `running`。
4. Provider 返回生成结果。
5. Flovart 保存 asset，并调用 `canvas.placeGeneratedResult`。
6. Response 返回 `jobIds`、`assetIds`、`elementIds`。

### 20.3 批量分镜生成

1. Agent 根据脚本创建 storyboard project。
2. Agent 为每个 shot 创建 `storyboard.createShot`。
3. Agent 调用 `generate.imagesBatch`。
4. Flovart 为批量任务创建 parent job 和 child jobs。
5. 每个成功结果保存 asset 并绑定 shot。
6. Agent 通过 `job.status` 轮询直到完成。

### 20.4 LibTV 结果导入

1. Agent 通过 LibTV skill 创建或查询外部 session。
2. Skill 下载生成结果或取得媒体 URL。
3. Flovart 通过 `assets.save` 导入媒体。
4. Flovart 通过 `assets.attachToCanvas` 放入画布。
5. Response 返回 `assetIds`、`elementIds` 和导入摘要。

## 21. 验收标准

### 21.1 MVP 可验收条件

- Claude Code/OpenCode/Codex 能通过 MCP 查询 `flovart.status`，拿到 session、provider、media 状态。
- Agent 能通过统一 action 生成一张图，并自动放入画布。
- Agent 能批量生成 storyboard 图片，返回 `jobIds`、`elementIds`、`assetIds`。
- Agent 能调用 LibTV import skill 或等价脚本导入结果，再放入 Flovart 画布。
- 任一失败都返回标准错误码，而不是裸字符串。
- 所有长任务都能通过 `job.status` 查询。
- 新 skill 只需新增 `SKILL.md + scripts/` 即可被 registry 发现。
- API key、provider secret、完整敏感 headers 不出现在 MCP/CLI 输出中。
- 视频导入结果必须使用正确 media type，不得误写为 image。

### 21.2 技术验收

- `npm run build` 通过。
- 关键 action 有 targeted tests 或最小可复现 CLI 验证。
- `tools/flovart/core.js` 仍保持确定性命令注册，不引入自然语言 planning。
- MCP 和 CLI 共享同一 action/result envelope 语义。
- `window.__flovartAPI` 不暴露 secret。

## 22. 关键风险

### 22.1 Harness 膨胀成通用 Agent 框架

风险：范围失控，Flovart 变成另一个半成品 agent platform。

对策：坚持 Flovart 专用 Harness，只做创作 runtime 的协议、状态、权限和执行。

### 22.2 Skill 越写越多但协议不统一

风险：Skill 数量增长后，Agent 调用成本指数级上升。

对策：P0 必须先统一 action/result envelope，再扩展 Skill。

### 22.3 Canvas、Workflow、Storyboard、Assets 状态互相绕

风险：输出结果无法追踪，用户不知道哪个媒体属于哪个 shot/job。

对策：使用 `outputRefs` 作为统一关联层。

### 22.4 GPLv3 许可证污染

风险：复制 TapNow GPLv3 代码会影响闭源或商业化空间。

对策：只借鉴产品结构和交互模式，不搬代码、不复制文件、不移植实现。

### 22.5 长任务无幂等导致重复扣费

风险：Agent 重试会重复生成、重复导入、重复写入画布。

对策：P0 支持 `idempotencyKey` 字段，P1 实现真正幂等执行。

### 22.6 Secret 泄露

风险：CLI/MCP/logs/trace 输出 provider secret。

对策：输出引用化、错误脱敏、禁止读取 secret、测试覆盖敏感字段。

## 23. 开发拆分建议

### 23.1 Milestone 1：协议与基础对象

- 新增 TypeScript 类型：`FlovartActionRequest`、`FlovartActionResponse`、`FlovartError`、`FlovartOutputRefs`。
- 新增 envelope helper。
- 新增标准错误码。
- 让 CLI/MCP 输出使用 envelope。

### 23.2 Milestone 2：Session / Job / Trace

- 新增 session store。
- 新增 job store。
- 新增 `session.create/get/list`。
- 新增 `job.status`。
- 将现有 generate action 接入 job lifecycle。

### 23.3 Milestone 3：Canvas 与 Generate Action 对齐

- 新增 `canvas.describe`。
- 对齐 `canvas.listMedia`、`canvas.addImage`、`canvas.addVideo`。
- 对齐 `generate.image`、`generate.imagesBatch`、`generate.video`。
- 所有结果返回 `outputRefs`。

### 23.4 Milestone 4：Skill Registry

- 扫描 `skills/**/SKILL.md`。
- 解析最小 manifest。
- 暴露 `skill.list`、`skill.describe`。
- 不执行脚本，不做 marketplace。

### 23.5 Milestone 5：Storyboard / Assets 初版

- 新增 storyboard project/shot 最小模型。
- 新增 assets save/list/attach action。
- 支持批量生成结果绑定 shot。

### 23.6 Milestone 6：LibTV Import 修正和统一导入

- 修正视频导入类型 bug。
- 将外部导入输出统一转成 assets。
- 统一返回 `assetIds`、`elementIds`。

## 24. Open Questions

- P0 的 session/job/trace 是否需要持久化到 IndexedDB，还是内存即可？
- `skill.list` 的 manifest 解析是否允许 YAML front matter，还是只解析固定 markdown section？
- P0 是否要暴露 `skill.invoke`，还是只做到 registry 可发现？
- Storyboard 是否已有隐藏数据结构可复用，还是需要从零定义？
- `workflow.run` 是否真的属于 MVP，还是应该推迟到 P1/P2？
- Agent 输出是否需要人工确认 gate，特别是涉及付费 provider 批量生成时？

## 25. Project Brief

目标：把 Flovart 从“可被脚本操控的 AI 画布”升级为“Claude Code/OpenCode/Codex 可调用的 Harness Agent Runtime”。

用户：Agent 使用者、Skill 作者、多模态创作者、后续平台集成者。

核心流程：用户给 Agent 指令，Agent 选择 skill/action，Flovart Harness 执行，生成或导入媒体，Canvas/Storyboard/Assets 形成可追踪结果。

技术方向：薄 Harness、胖 Skill、统一 Action Protocol、统一 Session/Job/Trace、MCP/CLI/Runtime Bridge 共用同一命令语义。

真实世界依据：当前仓库已具备 `window.__flovartAPI`、CLI、MCP、Flovart Skill 和多 skill 协作方向；LibTV/TapNow/Harness Engineering/Inngest 作为外部产品和架构参考，需在实现前补充来源复核。

关键风险：协议未统一、许可证污染、长任务不可恢复、Skill 权限不可控、Agent 重试导致重复扣费、secret 泄露。

验收标准：Agent 能稳定完成状态查询、图片生成、批量生成、外部结果导入、错误追踪、job 查询，且所有输出统一 envelope 并脱敏。

下一步：先确认 P0 协议与文件结构，再进入实现，不要直接扩展更多脚本。
