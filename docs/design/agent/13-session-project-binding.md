# SPEC-003：DSH Session / Flovart Project Binding

## Binding

`FlovartWorkspaceBinding` 是 DSH Session 进入视觉生产工作区时的显式上下文：

```ts
type FlovartWorkspaceBinding = {
  sessionId: string
  projectId: string
  workflowId?: string
  bindingVersion: number
}
```

它是现有 `Director Session Binding` 的 DSH 适配载荷，不创建第二个 Agent、第二条聊天历史或第二个 ProductionSession。`sessionId` 由 DSH Host 注入，模型不能自行改写；`projectId` 和 `workflowId` 是每个 Flovart Service 请求的显式目标。

绑定生命周期只有三种语义动作：创建/恢复、显式切换、归档。切换前必须确认目标 Project/Workflow 存在且当前 Session 有权限；切换后旧 Binding 保留历史但不再接收新 mutation。没有 Binding 的 Session 只能请求绑定或返回 `BINDING_REQUIRED`。

## Selection Context

Canvas PromptBar 发送给 DSH Agent 的上下文只包含当前选择和轻量摘要：

```ts
type FlovartSelectionContext = {
  projectId: string
  workflowId: string
  revision: number
  selectedNodeIds: string[]
  selectedAssetIds: string[]
  focusedNodeId?: string
}
```

它可以随用户输入写入当前 Session turn，或通过 `agent.inject()` 注入下一次 request。不得把完整 Canvas JSON、viewport、全部 Asset 元数据或数万 token 的图谱自动塞入 Prompt；Agent 需要细节时调用 `flovart_inspect`。

Selection、viewport、zoom、hover、panel state 和 Draft Prompt 是 UI Ephemeral State。它们可以作为 Agent Context，但不构成 Workflow、Run 或 Artifact 的生产事实。

## 访问规则

- `flovart_inspect`、`workflow.apply`、`run.start`、`job` 和 `artifact` 都经过 Binding 校验。
- UI 的“当前打开项目”只用于显示和生成默认表单值，不能绕过 Service Contract。
- Session A 的 mutation 不能因为 Session B 或浏览器 Tab 切换而改变目标。
- 所有跨 Session 的操作都必须显式建立新的 Binding 或通过授权的 Handoff，不复制隐式 active state。

## 验收场景

1. Session A 绑定项目“猫广告”，Session B 绑定项目“绝区零”，两者并行 inspect 不串线。
2. 用户切换浏览器 Tab 后，Session A 仍只能写入自己的 `projectId/workflowId`。
3. PromptBar 选择节点后，Agent 能拿到 selection IDs 和 revision，但不会收到全画布快照。
4. 恢复 DSH Session 后，Binding 和最后一次可回放的 selection context 有明确结果；不存在时显示需要重新选择或重新绑定。
