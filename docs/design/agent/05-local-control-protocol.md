# Flovart 本地控制协议

> 状态：目标设计。该协议是 Flovart 内部机器契约；外部 Coding Agent 的模型工具通过 CLI 使用它，不直接连接私有端口。DeepSeek Embedded Client 只消费短期配对、限权的 UI/事件子集。

## 目的

CLI、WebUI、Desktop IPC 与 Production Crew 需要共享同一套命令、事件、取消、恢复和错误语义。协议必须独立于某个 Harness 的 SDK，也独立于 HTTP、stdio 或 Tauri IPC 等具体传输。协议中的 Crew、Queue、Dispatcher 与 Worker 都是执行域名称；只有 Workspace Operator 是内置 AI 角色。

## 分层

```text
External Harness
  -> Operation Skill
  -> flovart CLI --json / --jsonl
  -> Local Control Protocol Client
  -> authenticated loopback | stdio | Tauri IPC
  -> Command Registry / Crew / Runtime / Workspace
```

外部 Harness 不读取 Discovery Token，不复用 WebUI Origin Token，不直接构造协议帧。CLI 负责发现、认证、版本握手、错误映射和退出码。

## 初始化握手

客户端连接后先交换：

```json
{
  "protocolVersion": "1",
  "client": { "name": "flovart-cli", "version": "..." },
  "requestedCapabilities": ["command", "events", "crew-intent"]
}
```

服务端返回：

```json
{
  "protocolVersion": "1",
  "runtimeInstanceId": "runtime_...",
  "registryHash": "sha256:...",
  "capabilities": ["command", "events", "crew-intent"],
  "limits": { "maxPayloadBytes": 1048576, "eventRetention": 10000 }
}
```

协议主版本不兼容时必须拒绝；Registry Hash 变化时客户端重新读取 `command.list`，不能继续用缓存 Schema。

## Command Envelope

所有命令复用一个 Envelope：

```json
{
  "protocolVersion": "1",
  "commandId": "cmd_...",
  "command": "crew.intent.submit",
  "args": {},
  "actor": {
    "kind": "external-director",
    "bindingId": "binding_...",
    "instanceId": "cli_..."
  },
  "idempotencyKey": "stable-key",
  "expected": {
    "projectId": "project_...",
    "draftVersion": 12
  }
}
```

命令名、参数 Schema、副作用等级、确认级别和可用状态全部来自 Canonical Command Registry。Crew Intent 不能建立第二套任意 JSON 工具系统。

## Crew Intent Envelope

```json
{
  "goal": "把当前选中的三张图片建立为并行图生视频分支",
  "scope": {
    "workspace": "workflow",
    "projectId": "project_...",
    "selectedObjectIds": ["image_1", "image_2", "image_3"]
  },
  "constraints": {
    "maxSteps": 12,
    "maxSideEffect": "draft-only",
    "allowedCapabilities": ["workflow.inspect", "workflow.node.create", "workflow.connect"]
  },
  "completion": {
    "requiredOutputs": ["changeset", "receipt"]
  }
}
```

Runtime 对结构和权限做最终校验；Operator 的 Prompt 不是安全边界。

## Receipt

提交命令立即返回接受回执或封闭错误。长时 Intent 返回 `intentId`，最终 Receipt 可查询或通过事件流观察：

```json
{
  "intentId": "intent_...",
  "status": "partial",
  "changeSetId": "changeset_...",
  "affectedObjectIds": ["operation_1", "operation_2"],
  "taskRefs": [],
  "waiting": {
    "reason": "PRECONDITION_FAILED",
    "objectIds": ["image_3"]
  },
  "eventCursor": 481
}
```

## 事件

事件采用递增游标与封闭类型，支持 `afterCursor` 恢复：

- `director.binding.changed`
- `crew.intent.accepted`
- `crew.intent.status_changed`
- `crew.tool.started` / `crew.tool.finished`
- `workspace.changeset.updated`
- `runtime.task.updated`
- `production.gate.requested`
- `artifact.created`
- `crew.receipt.completed`

CLI 一次性命令用 JSON；观察命令用逐行 JSONL。人类彩色日志只写 stderr，不能混入机器 stdout。

## 取消与恢复

- 取消请求以 `intentId`/`taskId` 定位，不杀整个 Agent Node 进程。
- Operator 停止新步骤后写最终 Receipt；Runtime Task 按自身取消状态机继续处理。
- 客户端断线不取消 Intent；重连后从游标恢复。
- 重复提交相同 `idempotencyKey` 与相同 payload 返回原 Receipt；相同 key 不同 payload 返回 `IDEMPOTENCY_CONFLICT`。
- 任何 `submission_unknown` 都必须可通过稳定 Task/Attempt ID重新查询。

## 传输与认证

| 场景 | 传输 | 认证 |
| --- | --- | --- |
| Tauri WebUI | 受限 IPC | Desktop 进程身份 |
| 本机 CLI | 随机 loopback 端口 | 用户范围 Discovery Record + 短期 Token |
| Toolkit 内部子进程 | stdio JSON-RPC/JSONL | 父进程句柄与 scrubbed env |
| 普通浏览器开发模式 | 显式配对 loopback | Origin 绑定 Token |

服务只监听 loopback/stdio，不使用固定公共端口，不允许任意 Origin，不把 Token 写入日志、URL 查询串或浏览器长期存储。

## 宿主协议隔离

Codex App Server、DeepSeek Harness SDK、Claude Code SDK/Hook、OpenCode Server 或 Pi RPC 可以存在于外部 Connector Plugin 内，但只能把宿主事件翻译成 Director Binding/Projection；它们不能改变 Flovart Local Control Protocol、直接获得 Workspace 写权或成为 CLI 的隐式必需依赖。宿主接口变更时最多禁用对应 Connector，不影响 Runtime、Workflow 和其他 Harness。
