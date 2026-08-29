# ADR 0066：DSH 集成模式下 Flovart 导航与连接状态解耦

## 决策

在 DSH Integration Mode 中，Flovart 插件安装并加载后，只要用户已经进入一个有效 DSH Session，Flovart `conversation.view` 就必须始终可见、可切换、可导航。活动 DSH Agent、Flovart Runtime 和 Provider 连接状态不能决定 Flovart view 是否存在；它们只决定当前 view 内哪些动作可执行。

P0 不伪造 DSH 全局页面，也不 fork DSH Sidebar。由于当前稳定扩展面仍是 Session-scoped `conversation.view`，启动页只负责让用户创建或恢复 DSH Session；进入 Session 后注册 `Chat | Flovart | Trajectory`。在没有 DSH Session 时，P0 不通过打开 localhost、创建隐藏 Session 或增加未经支持的 root navigation 来模拟全局 Flovart 页面。未来只有在 DSH 提供正式 global navigation/page contract 后，才增加不依赖 Session 的 Global Flovart 层。

## 能力门控

| 能力 | 是否要求 DSH Agent | 是否要求 Flovart Runtime | 是否要求 Provider |
| --- | --- | --- | --- |
| 进入/切换 Flovart view | 否 | 否 | 否 |
| 查看缓存或最后投影 | 否 | 否 | 否 |
| 读取最新 Workflow 状态 | 否 | 是，或诚实显示离线/过期状态 | 否 |
| 编辑 Workflow | 否 | 是，并通过 Binding 校验 | 否 |
| 向 Agent 提问 | 是 | 否，除非问题需要实时生产事实 | 否 |
| 提交生成/执行 Run | 否 | 是 | 是，并经过审批 |

Runtime offline 时保留 Flovart Tab，显示 `Visual Runtime is offline`、最近可用状态和 `[Start Runtime]`；不得把 Tab 隐藏成“插件不存在”。DSH Mode 的文案统一使用 `DSH Agent`、`Flovart Runtime`、`Providers`，不再出现“连接 Flovart Agent”作为前置条件。

Standalone Flovart 不受本 ADR 改变，继续使用 `Workflow | Table | Agent`。DSH Mode 不显示 Flovart 自己的 Agent Workspace；它不是 disabled 的第二 Agent，而是由 DSH 主对话接管后的非目标产品面。

## 不可违反的规则

> **Flovart views MUST remain navigable without an active Agent or Runtime connection; connection state gates actions, never navigation.**

- Chat → Flovart 使用当前 Session 的 view 切换、`workflowId` 和 `nodeIds` 聚焦，不打开新窗口或 localhost 页面。
- Flovart → Chat 通过 DSH Agent 的 `followup`/`steer` 入口提交 Selection Context；Agent 不可用时保留输入与选择，并显示未发送状态。
- PromptBar 在两种模式都保留；Standalone 发给 Flovart Agent，DSH Mode 发给 DSH Agent。
- Runtime 的 `offline/starting/ready/error` 是能力状态，不是路由状态。

## 后果

- 用户可以先看见并理解 Flovart，再决定是否启动 Runtime 或配置 Provider。
- Session、Agent、Runtime、Provider 四种状态不再被一个“连接 Agent”布尔值混合表示。
- P0 不承诺 DSH 启动页出现独立 Flovart 一级导航；这留给未来官方 global page contract。
- UI 需要区分空缓存、过期投影、Runtime offline、Agent unavailable 和 Provider unavailable，不能统一渲染为“页面不可用”。

## 拒绝的方案

- 未连接 Flovart Agent 就不注册或隐藏 Flovart Tab。
- 为了得到一级入口而 fork DSH Sidebar 或维护一套平行导航。
- 用 `window.open('/flovart')`、localhost 页面或隐藏 Session 绕过 `conversation.view` 的 Session 语义。
