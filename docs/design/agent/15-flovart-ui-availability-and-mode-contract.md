# SPEC-005：Flovart UI Availability 与 Mode Contract

## 目标

让用户理解三个独立状态：

```text
DSH Agent       = 智能交互主体
Flovart Runtime = 视觉生产事实与执行机器
Providers       = 图像/视频/音频模型线路
```

导航只反映 UI 是否安装和当前 DSH Session 是否存在；动作才根据 Agent、Runtime、Provider 和权限分别门控。

## 两种产品模式

| 模式 | 主交互入口 | Flovart 面 | Agent 面 |
| --- | --- | --- | --- |
| Standalone | Flovart 自己的工作区 | `Workflow | Table` | 显示 Flovart Agent Workspace |
| DSH Host | DSH Workspace / Session / Chat | Session 内 `Flovart` view，包含 `Workflow | Table` | 不显示 Flovart Agent Workspace，DSH Chat 是唯一 Agent 入口 |

DSH Mode 不能出现“Flovart Agent（不可用）”这种第三种角色。Agent Workspace 是不属于该模式的产品面，而不是暂时断线的能力。

## P0 进入路径

```text
插件已安装并加载
        ↓
DSH 创建或恢复 Session
        ↓
注册 Flovart conversation.view
        ↓
Chat | Flovart | Trajectory
        ↓
Flovart Canvas 或 Runtime offline 状态页
```

进入 Session 前不要求启动本地 Runtime、连接 Flovart Agent、填写 Token 或配置 Provider。进入 Flovart view 后：

- Runtime ready：显示 Runtime-backed Workflow 与可执行操作。
- Runtime offline：保留页面，显示最后可用投影/缓存、离线原因和 `Start Runtime`。
- Runtime starting：保留页面，显示启动中，不重复创建 Session 或 Agent。
- Agent unavailable：保留 Canvas，PromptBar 显示暂不能发送给 DSH Agent，但不隐藏画布。
- Provider unavailable：保留 Workflow 编辑，禁止付费生成并显示 Provider 状态。

## 动作门控

```text
导航 Flovart                 → Plugin + DSH Session
读取最新 Workflow             → Flovart Runtime
编辑 Draft                    → Runtime + Project Binding
Ask DSH Agent                 → DSH Agent
运行生成                      → Runtime + Provider + Approval
```

这些条件必须在 UI 上分开呈现。不得把 `agentConnected && runtimeReady && providerReady` 合并为一个 `flovartEnabled`，也不得用“插件未安装”覆盖真实的 Runtime offline。

## Chat / Canvas 互跳

Chat 中的 Workflow Card 点击 `Open in Flovart` 时，只写入当前 Session 的 view 和 focus request：

```ts
type FlovartFocusRequest = {
  projectId: string
  workflowId: string
  nodeIds?: string[]
  artifactIds?: string[]
}
```

它不得打开新窗口、localhost 或独立 Flovart Agent 页面。Canvas 选中节点后，PromptBar 保留并提交 `FlovartSelectionContext`；DSH Agent 通过 `followup`/`steer` 接收。如果 Agent 不可用，输入和选择必须可保留、可重试，不能伪造“已发送”。

## Global Flovart 的后续层级

P1 可以在 DSH 提供正式 root-scoped global navigation/page contract 后增加：

```text
Global Flovart
├ Project Browser
├ All Projects
└ Assets
```

Global Flovart 不属于任何 Session；用户从 Project Browser 选择 `Start with Agent` 后，才创建或绑定 DSH Session。P0 不提前实现这套全局导航，也不通过私有 Sidebar slot 假装实现。

## 验收

1. 无 Flovart Runtime 时，已有 DSH Session 仍能切到 Flovart Tab，并看到离线状态页。
2. 无 DSH Agent 时，Flovart Canvas 仍能打开；PromptBar 显示不可发送而不是隐藏。
3. Chat 的 `Open in Flovart` 不打开新窗口，能在同一个 Session view 聚焦指定 Workflow/节点。
4. Canvas 的 `Ask Agent` 只调用 DSH Agent；不启动第二个 Flovart Agent Loop。
5. Standalone 仍显示 Agent Workspace，DSH Mode 不显示它。
6. 没有正式 global page contract 时，不出现伪造的 Flovart 一级导航。
