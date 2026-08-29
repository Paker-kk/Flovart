# Workflow 工具与执行模型

> 状态：目标设计。AI 原生 Workflow Draft 的详细图模型继续由 ADR 0058 约束；本文件只定义导演台与制作组如何使用它。

## 两种调用方式

External Director Harness 可以根据确定性程度选择：

1. **原子命令**：对象 ID、参数和期望版本都已明确时，直接调用 `workflow.*` CLI 命令。
2. **Crew Intent**：目标明确但需要读取现场和选择少量步骤时，提交有界 Intent 给 Workspace Operator。

两种方式都必须进入同一个 Command Registry、Draft Authority Port 和 ChangeSet 模型。Crew Intent 不是绕开命令 Schema 的“自然语言超级接口”。

## 稳定模型工具面与 CLI discovery

所有 Host Projection 的模型工具固定收敛为 `status`、`workflow.inspect`、`workflow.selection.get`、`workflow.apply`、`workflow.node.run`。Workflow 的写入使用结构化 `operations`，执行仍交给 `WorkflowExecutor`；Production/Runtime 控制不复制到 Agent 工具集合。

`command.list` / `command.schema` 仍是 CLI bootstrap、Distribution Target 安装后的 discovery/debug 能力，供 Host Projection 在契约未知、诊断或兼容适配时使用，但不应在每个模型回合动态展开成第二套工具面。Operation Capability Registry 继续作为 UI、Dispatcher、Workflow/Runtime Preflight 的内部事实源。

明确禁止两种捷径：不一次注册全部命令制造选择与 Token 噪音；不提供可接受任意命令名和任意 JSON 的 `flovart_exec(command,args)`。实际执行仍经过同一 CLI、Registry、Gate、Authority 与幂等校验，不能据此获得额外能力。

## Workflow Draft Authority

一个 Workflow Project 任一时刻只有一个 Draft Authority：

- 纯 Web 项目可以由 Browser Workspace/localforage 承担；
- Desktop/Agent Toolkit 项目由 Local Data Service 承担；
- 切换 Authority 必须显式导出、校验、导入和绑定；
- UI、CLI、Operator、Dispatcher 与 Timeline 只能通过 Draft Authority Port 访问；
- Zustand 只是 UI projection/cache，不是第二个写端。

Production Plan Projection 只同步已批准 Run 的状态和 Artifact，不能覆盖编辑中的 Draft。

## Draft ChangeSet

一个 Crew Intent 对应一个 Draft ChangeSet。ChangeSet 保存：

- actor/binding/intent；
- 类型化 Draft Action 顺序；
- 受影响对象和前后差异；
- Draft/Object Version；
- completed/partial/failed/undone 状态；
- Task、ProviderAttempt、费用和 Artifact 引用；
- waiting 原因与恢复入口。

动作逐步耐久提交并实时显示。部分失败保留成功步骤；按组撤销只逆转 Draft 图，不伪造撤销 Provider 副作用。

## 对象级并发

每个写动作携带 `baseDraftVersion` 与受影响对象的 `expectedObjectVersion`。版本不匹配返回 `PRECONDITION_FAILED`、当前版本和最小冲突对象：

- Operator 只重读冲突子图；
- 不相关对象继续执行；
- 人工修改不会被旧 Operator 快照静默覆盖；
- 多对象原子操作必须全部满足前置条件；
- 不使用整图锁或最后写入获胜。

## Operation Capability Registry

Registry 是 UI、CLI、Operator 与 Runtime 的共同工具事实源。每个能力定义：

```text
id + version
workspaceEligibility
inputRoles / outputRoles
recipeSchema / parameterSchema
executorKind
sideEffectClass
confirmationClass
resultPolicy
```

Toolbar、参数控件、Agent Tool Schema、Dispatcher、Preflight、费用/确认和 Contract Test 都从 Registry 派生。Production Skill 只能组合已注册能力；不能注册任意 HTTP、Shell、脚本或私有 Provider 调用。

## Prompt 与输入权威

- 每个结果型 Operation 只有一份 Operation Prompt Document。
- PromptBar 与 Operator 修改同一文档，不新增 Agent 专属 Prompt 副本。
- `@` chip 与画布输入边投影自同一 Operation Input Binding，包含稳定 ID、角色和顺序。
- 执行时冻结 Execution Prompt Snapshot，记录实际提交文本、引用、参数和编译器版本。
- 输出 Take 保存 Recipe Hash；旧 Recipe 的晚到结果保留但不自动成为当前输出。

## Layout Intent

Operator 只表达相对位置、并排、分支、分组和顺序提示。确定性 Layout Planner 根据真实节点尺寸和占用区域计算坐标：

- 人工 pinned 节点不移动；
- 布局动作进入 ChangeSet 并可撤销；
- 纯布局变化不更新 Recipe Hash、ProductionSpec 或授权；
- 不允许模型猜绝对坐标后每回合重排全图。

## 长时任务

Operator 调用 Provider/Render 等能力后只接收持久 Task/Run 句柄：

1. Runtime 原子持久提交和外部 job ID/unknown 状态。
2. Intent Receipt 记录句柄并可以完成或进入 waiting。
3. Runtime Event Stream 更新 Task、费用与 Artifact。
4. 只有用户 Gate、语义失败、冲突或额外输入才创建新的 Director Intervention。

Operator 不使用模型回合轮询 Provider，也不因外部 Harness 断线终止任务。

## Workflow 与 Table

Workflow 只保留单步、局部、直接服务生成链的 Operation；批量、多步骤、多输入/多输出、时间轴精修与可复用处理链进入 Table。

Promotion 必须显式：创建独立 Table Session，Workflow 保留来源引用；Table 内部试验不回写 Workflow，只有明确发布的 Artifact 通过新 ChangeSet 更新引用。制作组可以执行 Promotion，但不能让两个工作区共同写同一节点或配方。

## 副作用分级

| 等级 | 示例 | 默认行为 |
| --- | --- | --- |
| read-only | inspect/status/list | 直接执行 |
| draft-only | 创建、连线、移动、改 Prompt | 执行并进入可撤销 ChangeSet |
| local-artifact | crop、抽帧、无费用转换 | 按本地资源策略执行 |
| provider-paid | 图片/视频/语音提交 | Production Plan Card + 用户 Gate |
| publish/external | 发布、发送或覆盖外部目标 | 精确目标、内容与权限确认 |
| irreversible | 不可恢复删除 | 强确认或禁用 |

## 删除门槛

只有当原子 CLI 与 Crew Intent 均通过同一 Registry/Authority/ChangeSet 后，才删除网站 one-shot JSON Agent、浏览器/Node 两套旧内置主会话和宿主私有工具路径。迁移期也不允许旧路径获得新能力。
