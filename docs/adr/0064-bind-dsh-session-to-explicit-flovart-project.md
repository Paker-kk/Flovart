# ADR 0064：DSH Session 使用显式 Flovart Project Binding

## 决策

DSH Session 与 Flovart Project 的关联必须通过显式、可验证的 `FlovartWorkspaceBinding` 表达。它是现有 `Director Session Binding` 在 DSH 视觉工作区中的具体适配载荷，不是第二套 Agent 会话或第二种项目权威。

```ts
type FlovartWorkspaceBinding = {
  sessionId: string
  projectId: string
  workflowId?: string
  bindingVersion: number
}
```

每一次 inspect、mutation、run、job 或 artifact 操作都必须携带或由已验证的 Binding 派生出明确的 `projectId`；会修改 Workflow 的操作还必须明确 `workflowId`。Runtime 不得读取 `lastOpenedProject`、`currentProject`、浏览器活动 Tab 或其他隐式全局状态来决定目标。

`sessionId` 由 DSH Host 提供并校验，不能由模型通过参数伪造。项目切换是显式动作：先创建或更新 Binding，再允许后续操作；Binding 不匹配、项目不存在或 Workflow 不属于该项目时拒绝请求。一个 Session 的当前活动视觉 Binding 只有一个，旧 Binding 可归档但不能静默覆盖其历史。

## 后果

- 多个 DSH Session 可以同时操作不同 Flovart Project，互不因浏览器切 Tab 而串线。
- PromptBar、Conversation Node、Tool Card 和 DSH Job 都能通过 `projectId/workflowId` 回到确定的生产对象。
- Client 的“当前打开项目”仍可作为 UI 便利状态，但不能作为 Service Contract 的隐式输入。
- 未来支持多项目并行时，必须扩展为显式 Binding 切换或多个命名 Binding，不能退回全局 active project。

## 拒绝的方案

- 让 Agent 默认操作最近打开的项目。
- 把项目 ID 只放在 URL、React store 或 Prompt 文本里。
- 为每个 DSH Session 启动一个没有明确 Binding 的 Flovart Agent Loop。
