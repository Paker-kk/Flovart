# SPEC-004：Flovart Durable Projection Events

## 事件来源

Flovart Runtime 是 Production Run 的事件来源。DSH Adapter 将可展示的生产事件写入当前 Session log；事件不是 Provider 数据库的替代品，也不携带完整 Prompt、秘密或巨大 Artifact 内容。

```ts
type FlovartProjectionEvent = {
  eventId: string
  eventSeq: number
  type: "flovart/run-start" | "flovart/run-progress" | "flovart/run-end"
  runId: string
  projectId: string
  workflowId: string
  occurredAt: string
  payload: Record<string, unknown>
}
```

同一个 `runId` 是 Conversation Node 的稳定业务 ID，`eventSeq` 用于顺序、去重和断点恢复。Adapter 必须把 Runtime 的真实终态映射为 `completed`、`failed`、`cancelled` 或 `interrupted`，不能用 Agent 的自然语言回复猜测终态。

## Conversation Node

`ConversationNodeDefinition` 只保存 `FlovartRunPresentationState`，例如标题、阶段、完成数、总数、最近 Artifact 引用、错误摘要和可用动作。它从 `flovart/run-*` 事件重建，必要时使用 Runtime snapshot 补齐；Renderer 不拥有 Run 状态，也不能通过点击直接 mutate Runtime。

```text
flovart/run-start
        ↓
Production Run Conversation Node
        ↑
flovart/run-progress × N
        ↑
flovart/run-end
```

`Tool Card` 仍然只展示一次 `flovart_inspect`、`flovart_workflow_apply` 或 `flovart_run_start` 的调用与结果。Production Run、Workflow Apply、Render Batch 等跨多次调用的业务过程才使用 Conversation Node；两者不能互相替代。

## DSH Job Projection

DSH Job 记录 `jobId`、`flovartRunId`、owner 和监督状态。`job_list/job_output/job_kill` 可以让 Agent 等待、查看或请求取消，但状态读取和取消结果必须回到 Flovart Runtime。Job cleanup、Session 关闭或 Harness 断开不能伪造 Run 完成或取消。

## 恢复与验收

- Session 重载后仅依赖 durable events 或 Runtime snapshot 即可重建 Conversation Node。
- 重复投影同一个 `eventId/eventSeq` 不会重复创建节点或产物卡片。
- Runtime 事件延迟时显示诚实的同步中状态，不把 DSH Job 的中间状态冒充为生产终态。
- Run 完成后，Chat 中的 Production Run Card 可以通过稳定 `runId` 打开对应 Workflow/Artifact 视图。
