# ADR 0065：Workflow 变更使用版本前置条件与幂等 Mutation ID

## 决策

所有从 DSH、CLI、UI 或 Workspace Operator 进入 Runtime 的 Workflow 写操作都必须同时具有目标范围、`expectedRevision` 和稳定的 `mutationId`。P0 使用 Workflow 级 revision 做乐观并发控制；已有的 Draft Object Version 可继续用于更细粒度的内部冲突判断，但不能替代外部变更请求的 revision 前置条件。

```json
{
  "projectId": "project_12",
  "workflowId": "workflow_5",
  "expectedRevision": 183,
  "mutationId": "mut_8fd23",
  "operations": []
}
```

Runtime 在同一事务中校验目标与 revision、执行全部操作、递增 revision，并持久化 Mutation Receipt。相同 `(projectId, workflowId, mutationId)` 且请求内容哈希相同的重试必须返回第一次的相同 Receipt，不得再次 mutate；相同 Mutation ID 搭配不同 payload 必须返回 `IDEMPOTENCY_KEY_REUSE`。过期 revision 必须返回 `PRECONDITION_FAILED` 及当前 revision/冲突对象，不能使用最后写入获胜。

## Receipt 约束

```ts
type MutationReceipt = {
  mutationId: string
  projectId: string
  workflowId: string
  previousRevision: number
  revision: number
  applied: boolean
  replayed: boolean
  operationResults: unknown[]
}
```

调用方在网络断开后必须使用原 Mutation ID 重试，不能每次重试都生成新 ID。DSH Session 事件、Conversation Node 或 Tool Card 只能记录 Receipt，不能代替 Runtime 的幂等记录。

## 后果

- Agent 的超时重试不会重复创建节点、连线或触发重复执行。
- 人工编辑与 Agent 编辑发生竞争时，冲突是可见、可重读、可重试的，而不是静默覆盖。
- Runtime 需要保存有限期或可清理但可查询的 Mutation Receipt；清理策略不能破坏仍可能重试的调用。
- `workflow.apply` 可以保持语义批量操作，避免 Agent 连续调用几十个底层节点 API。

## 拒绝的方案

- 只校验 `expectedRevision`，把自身重试误判成外部冲突。
- 每次重试重新生成幂等键。
- 让 DSH Session event ID 充当 Workflow Mutation ID。
