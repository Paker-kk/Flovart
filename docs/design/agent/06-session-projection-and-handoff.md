# 会话绑定、投影与交接

> 状态：目标设计。外部 Harness 保存主记忆；Flovart 只保存绑定、投影和执行事实。

## 三种不同数据

| 数据 | 含义 | 权威 |
| --- | --- | --- |
| Director Session | 用户与外部 Harness 的完整对话、计划和宿主内部状态 | External Director Harness |
| Director Session Binding | ProductionSession 到一个外部 Session 的可恢复非秘密关联 | Flovart |
| Director Session Projection | Agent Workspace 用于展示的可重建摘要和状态 | Flovart read model |

Workspace Operator 是两个 AI 角色中的唯一内置角色，但不拥有另一条“内置主会话”。它只在一个 Intent 内保留临时模型上下文，完成或失败后由 Receipt、ChangeSet 和 Task 状态替代。Production Crew 的其他组件没有会话。

## Director Session Binding

Binding 最少保存：

```text
bindingId
productionSessionId
hostKind
hostInstanceId?
externalSessionId
connectorVersion?
capabilities[]
createdAt / lastSeenAt
resumeCursor?
state: active | disconnected | archived
```

- `externalSessionId` 是宿主生成的不透明标识，不包含 Token、路径或聊天内容。
- 一个 ProductionSession 同时只有一个 Active Binding 能提交新的 Director Intent。
- 一个外部 Harness Session 同时也只能活动绑定一个 ProductionSession；Binding 在两个端点上都唯一。
- 旧 Binding 归档但不删除，便于审计和切换回原宿主。
- Binding 只证明会话关联，不证明宿主仍在线、已登录或具备某项能力。

## Agent Bridge

Agent Bridge 是连接与交接控制面，不是新的会话权威。它可以展示已发现的 Host Projection、Session 引用和可用增强能力，但当前 ProductionSession 只有一个 Active Director Binding；只有已实现 Binding 的 Agent Identity 才能成为 Director，其它 Host 在显式 Handoff 前只能只读观察或接收用户明确发送的结构化任务。

Handoff 必须先固化 Director Handoff Snapshot、归档旧 Binding，再给新宿主建立写权。Agent Bridge 不广播完整聊天、不合并各宿主记忆，也不允许“最后写入获胜”式并行导演。

## 项目切换

在 DeepSeek 主壳的 Flovart Dock 中，仅浏览另一个 Flovart Project 或 ProductionSession 不会自动重定向当前导演会话。若目标与 Active Binding 不同，工作区先进入可浏览但不可由当前 Director 写入的状态，并要求用户选择新建/恢复对应 Harness Session，或在 Agent Bridge 执行显式 Director Handoff；完成前不切换渐进式工具面，也不继承原 Session 的 Production Mandate、预算或待审批项。

显式切换会先为原 ProductionSession 固化 Handoff Snapshot 并归档旧 Binding，再建立目标端的一对一 Binding。切回旧项目优先恢复其原 Harness Session；宿主无法恢复时才创建新 Session 并注入脱敏 Handoff，而不是把多个项目上下文合并进同一个聊天。

## Director Session Projection

Projection 只包含用户可见且有产品价值的数据：

- 当前 Director 名称、宿主类型和在线/失联状态；
- 用户显式发布的任务标题或摘要；
- running/waiting/done/error 等归一化状态；
- 当前 Intent、待确认项、Receipt 和 Artifact 引用；
- 最近同步游标、时间和失败原因；
- 回到外部 Harness 的 deeplink/恢复提示（宿主支持时）。

Projection 不保存完整聊天、隐藏推理、Shell 输出、文件 diff、宿主凭据或未脱敏工具参数。丢失 Projection 时，可以从 Binding、Crew/Runtime 事件和 Artifact 引用重建；不能反向重建外部主对话。

## Workspace Operator 临时上下文

每个 Intent 建立独立临时上下文：系统约束、Intent、最小工作区快照、已执行工具结果和当前预算。以下数据不跨 Intent 自动继承：

- 上一轮自然语言聊天；
- 未确认假设；
- 模型隐藏思考；
- 已过期 Draft 快照；
- 任何 Provider Secret 或宿主上下文。

需要跨 Intent 的事实必须先成为 Flovart 权威对象、Director 提供的显式约束，或可引用的 Director Handoff Snapshot。

## Director Handoff Snapshot

切换外部 Harness 时，Flovart 生成不可变、可脱敏、可审计的交接快照：

```text
project / productionSession ID
Brief 与已确认目标摘要
Bound Production Skill 精确版本
当前 Draft / Spec Revision 引用
已确认决策与待审批项
运行中的 Task/Run 摘要
Artifact 与 Receipt 引用
预算与 Gate 状态
```

它不包含原始聊天、隐藏推理、宿主文件、API Key 或“请相信上一个 Agent”的自由文本结论。新 Harness 必须通过 CLI 重新读取权威状态，再决定是否继续。

## 恢复流程

### Flovart 重启，Harness 仍在

1. Runtime 恢复 ProductionRun/Task/Event。
2. Agent Workspace 读取 Binding 与 Projection。
3. Harness 下次 CLI 调用刷新 `lastSeenAt` 和游标。
4. 未完成 Intent 从持久状态恢复或明确标记 `interrupted`，不会假装仍在模型推理。

### Harness 重启，Flovart 仍在

Harness 使用自己的 Session ID 恢复；若 ID 不变，更新原 Binding。若宿主无法恢复，创建新 Binding 并附带 Director Handoff Snapshot，旧 Binding 归档。

### 双方都重启

Runtime/Workspace 先恢复各自权威；Harness 恢复主会话后重新绑定。Director 通过 CLI 查询未完成 Intent、Task 与 Gate，不依赖 WebUI 中的一份聊天副本。

### 连接断开时有长任务

长任务继续运行。Projection 显示 Director disconnected、Runtime 的真实状态和人工 Gate；用户可以在 Flovart UI 完成 Production Gate，但不能让内置 Operator 接管整体导演计划。

## 存储边界

| 存储 | 内容 |
| --- | --- |
| Production Runtime SQLite | Binding、Intent、Receipt、Task/Run/Gate/Artifact 事实 |
| Workflow Draft Authority | ChangeSet、Action、Object Version、Binding、Take 与布局 |
| 浏览器 localforage | Agent Workspace 布局和可重建 Projection cache |
| 外部 Harness 自有存储 | 主对话、计划和宿主 Session |

不再维护 `agent-sessions.db` 作为产品主会话权威。项目尚未上线，不为旧内置聊天写双轨兼容或自动导入；迁移完成后旧库只保留人工导出/清理说明。
