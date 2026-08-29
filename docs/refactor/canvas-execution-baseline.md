---
title: Canvas execution refactor baseline
---

# Canvas execution refactor baseline

本轮只记录 Phase A 开始前的工作区锚点，不代表当前分支所有改动都属于本轮。工作区在开始时已有大量未提交用户改动，因此不创建回滚提交，也不覆盖或清理这些改动。

## 现场锚点

- 基线提交：`22f5fb40df5935bd3e7500cc5cec7c82e4e29755`
- 基线聚焦测试：`npm exec vitest run tests/workflowInputResolver.test.ts tests/workflowReferenceIntegrity.test.ts tests/workflowExecutor.test.ts`
- 基线结果：3 个测试文件、9 个测试通过。

## Phase A 开始前的执行路径

- Workflow UI 通过 `services/workflowGeneration.ts` 运行节点。
- Browser Agent 通过 `services/workflowDispatcher.ts` 的 `WorkflowExecutor` seam 转发节点运行。
- `components/workflow/inputResolver.ts` 已被 P0 生成路径使用，但资源类型仍在 resolver 内按 `node.type` 推断。
- `WorkflowResourceReference` 已存在，但引用实例没有独立的声明资源 ID；解析结果同时暴露 `href`、`storageKey`、`artifactRef` 等兼容字段。
- `services/workflowResourceResolver.ts` 已存在但未接入生成路径；生成路径内仍有一份媒体 href hydrate 逻辑。

## 已知风险

- 资源身份、节点 metadata locator 和 Provider 可执行地址容易被后层混用。
- Runtime artifact 可能只有 `taskId`，不能把缺少 `href` 当成资源不存在。
- 空的已连接媒体必须保留到验证阶段，不能在 Graph 解析时静默过滤。

## Phase B known baseline

- 全量 `npm test` 在 `tests/dshNativeWorkflowView.test.tsx` 的 Runtime offline 文案断言失败；该失败属于 Phase A 之前的 DSH 现状，本阶段不修复。
- `npm exec tsc -- --noEmit` 在同一测试文件第 136、137 行报告 `TS2532` 与 `TS2493`；本阶段不新增或扩大这组无关失败。

## Phase C baseline for Phase D

- Canonical provider seam 已完成：`CanonicalGenerationInput → capability validation → materialize → provider wire serializer`，并覆盖真实 OpenAI `/images/edits` multipart body。
- Phase C 全量结果：`npm test` 为 122 个测试文件、877 passed、1 skipped；唯一失败仍是 `tests/dshNativeWorkflowView.test.tsx` 的既有离线文案断言。
- Phase C 类型检查：`npm exec tsc -- --noEmit` 仅保留上述 DSH 测试的 4 个既有 TypeScript 错误。
- Phase C 构建与差异检查：`npm run build` 通过，`git diff --check` 通过。
- Phase D 不修复或扩大 DSH baseline，不迁移 Workflow SoT，不修改 PromptBar、Agent Workspace 或 Canvas mutation。

## Phase F0 baseline

- F0 开始前普通 Vite 浏览器不会从 Dock 配对建立 `ManagedAgentConnection`；`getManagedAgentConnection()` 在非 Tauri 环境固定返回 `null`，Workflow adapter 因此无法连接本机 Agent。
- F0 开始前 `WorkflowAgentBridge` 在浏览器侧直接调用 `dispatchWorkflowCommand`，没有独立的 Browser Workflow Contract seam。
- F0 开始前 `WorkflowAgentSession` 在没有浏览器客户端时会自动启用 `NativeWorkflowStore`，造成 CLI/Agent 可能绕过可见浏览器 Workflow。
- F0 开始前 CLI 路由虽支持 `workflow.node.run/stop`，但 canonical Registry 将它们标为 `legacy-only`，与 Workspace Adapter 的公开执行入口不一致。
- F0 不改变 Provider、PromptBar、DSH Native Draft 或 Workflow SoT；native workspace 仍保留，但只能通过显式注册启用。

## 本轮非目标

- 不修改 PromptBar、Mention 持久化或 `imageReferenceOrder`。
- 不重构 Provider capability、Gateway payload 或 DSH。
- 不改变 Browser/Runtime Workflow SoT，不迁移 Agent Workspace。
- 不执行发布、版本提升、全仓库无关清理或危险 Git 操作。
