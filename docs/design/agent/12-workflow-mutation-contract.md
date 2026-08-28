# SPEC-002：Workflow Mutation Contract

## 请求

P0 的 Workflow 变更以一个原子 `workflow.apply` 请求提交。请求同时包含显式范围、版本前置条件、稳定幂等键和语义 operations。

```ts
type WorkflowMutation = {
  ctx: FlovartRequestContext
  projectId: string
  workflowId: string
  expectedRevision: number
  mutationId: string
  operations: WorkflowOperation[]
}
```

`operations` 可以包含 `create_node`、`update_node`、`connect`、`disconnect`、`move_node` 和 `delete_node` 等受 Schema 约束的语义动作。它们在 Runtime 内一次性校验和提交；P0 不要求模型连续调用底层节点 API。

## 成功与重试

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

首次提交返回 `applied: true, replayed: false`。网络超时后使用相同 Mutation ID 重试，Runtime 返回已持久化的相同 Receipt，并将 `replayed` 设为 `true`；不得新建节点或再次递增 revision。相同 Mutation ID 但 payload 哈希不同，返回 `IDEMPOTENCY_KEY_REUSE`。

Receipt、mutation payload hash 和 revision 更新必须在同一 Runtime 事务中落盘。Receipt 是生产审计记录；DSH Tool Card、Session event 和 Conversation Node 只引用它。

## 冲突

当 `expectedRevision` 不是当前 revision 时，Runtime 返回：

```json
{
  "code": "PRECONDITION_FAILED",
  "expectedRevision": 183,
  "actualRevision": 184,
  "conflictObjectIds": ["node_13"]
}
```

调用方必须重新 inspect 最小相关子图，再生成新的 Mutation ID。不能自动把旧 operations 以最后写入获胜的方式覆盖当前 Workflow。

## 与 Draft Object Version 的关系

Draft Authority 可以继续使用对象版本减少无关节点之间的冲突；但跨 Service 的 P0 mutation 仍以 Workflow revision 作为最低一致性门槛。未来若开放对象级 patch，仍必须保留显式 scope、Mutation ID 和可回放 Receipt。

## 验收场景

1. revision 18 的 Workflow 首次 apply 后变成 19。
2. 同一个 Mutation ID 重试不会变成 20。
3. 另一个编辑者先把 revision 改成 19 时，旧请求得到 `PRECONDITION_FAILED`。
4. 相同 Mutation ID 换 payload 时不会执行第二份操作。
