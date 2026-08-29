# SPEC-001：`ctx.flovart` Service Contract

## 目的

为 DSH Agent、Flovart Native View、CLI 和未来其他 Host 提供同一个 Flovart 能力入口。调用方依赖 Service Interface，不直接请求 Flovart HTTP、读取 Browser IndexedDB、操作 React Canvas 或启动第二个 Flovart Agent Loop。

## Service Interface

`ctx.flovart` 是一个深模块：公开少量语义能力，内部由 Runtime Adapter 通过 Flovart Command Registry 实现。

```ts
type FlovartRequestContext = {
  sessionId: string
  actor: "dsh-agent" | "dsh-ui" | "cli"
}

type FlovartScope = {
  projectId: string
  workflowId?: string
}

interface FlovartService {
  binding: {
    get(ctx: FlovartRequestContext): Promise<FlovartWorkspaceBinding | null>
    set(ctx: FlovartRequestContext, binding: FlovartWorkspaceBinding): Promise<FlovartWorkspaceBinding>
  }
  inspect(input: {
    ctx: FlovartRequestContext
    scope: FlovartScope
    selectors?: string[]
  }): Promise<FlovartInspection>
  workflow: {
    apply(input: WorkflowMutation): Promise<MutationReceipt>
  }
  run: {
    start(input: ProductionRunRequest): Promise<FlovartRunHandle>
    status(input: { ctx: FlovartRequestContext; runId: string }): Promise<FlovartRunView>
    cancel(input: { ctx: FlovartRequestContext; runId: string }): Promise<FlovartRunView>
  }
  artifact: {
    inspect(input: { ctx: FlovartRequestContext; artifactIds: string[] }): Promise<ArtifactView[]>
  }
}
```

以上是契约形状，不要求第一版拆成独立 npm 包。Provider 负责连接和权限，Consumer 是 DSH tools/client，Flovart Runtime Adapter 负责把语义方法映射为 `command.list`、`command.schema` 和显式 Command Registry 调用。

## 工具投影

P0 只向模型暴露语义工具，例如：

```text
flovart_binding
flovart_inspect
flovart_workflow_apply
flovart_run_start
flovart_run_status
flovart_run_cancel
flovart_artifact_inspect
```

工具不是 `flovart_exec(command, args)` 的薄转发，也不暴露 Provider secret、浏览器存储键或 React 节点实例。工具 schema 必须要求或验证 `projectId/workflowId`，写操作还必须要求 `expectedRevision/mutationId`。

## 错误与权限

Service 至少区分 `BINDING_REQUIRED`、`BINDING_MISMATCH`、`NOT_FOUND`、`PRECONDITION_FAILED`、`IDEMPOTENCY_KEY_REUSE`、`APPROVAL_REQUIRED`、`RUN_NOT_CANCELLABLE` 和 `RUNTIME_UNAVAILABLE`。只读 inspect 不应伪装成成功的空结果；外部调用、费用动作、破坏性动作沿用 DSH pre-execute approval。

## 验收

- DSH Agent、CLI 和 Native Workflow View 对同一操作都经过同一个 Service Interface。
- 断开 Browser Client 时，Runtime 仍可查询 Workflow revision 和已提交 Run。
- 任意工具都不能从隐式 active project 推导 mutation 目标。
- Service 连接失败时返回结构化错误，不回退到直接 HTTP 或本地 store。
