# 唯一内置执行 Agent 与 Production Crew

> 状态：目标设计。系统只保留一个轻量 Workspace Operator 作为内置执行 Agent；Production Crew 是它与普通工具/服务的集合名，不是多 Agent 组织。

## 为什么仍需要一个内置执行 Agent

如果外部 Harness 已经能发精确原子命令，Flovart 不需要再套一层 LLM。Workspace Operator 只解决一种外部 Harness 难以稳定完成的本地语义问题：它可以读取当前工作区现场，把一个有边界但不含精确对象步骤的意图，转换成少量可逆、可验证的 Flovart 动作。

例如导演台说“把所选三张图排成并行分支，并为每张图建立一个图生视频 Operation”。Operator 可以检查选择、媒体类型、现有连接和空间占用，再选择正确节点、Binding、连接和 Layout Intent；它不能把任务扩成“顺便生成整部影片”。

## 启动规则

精确原子命令直接进入 Command Dispatcher，不创建 Operator 模型回合。Crew Intent 若能由封闭规则完整展开，也优先走确定性规划；只有目标有界、对象范围明确，但必须根据当前工作区状态选择少量步骤时，才为该 Intent 临时启动 Workspace Operator Kernel。Intent 终态后销毁模型上下文，只保留 Receipt、ChangeSet、Task 和事件。

DeepSeek Harness Embedded Plugin 不把 Workspace Operator 实现成 Cordis Subagent/Agent Preset，也不把它挂进导演主 Session；Codex、DeepSeek Harness 与其它 Coding Agent Projection 都调用同一个 Flovart Operator 边界。外部 Harness 断开时不再接受新的 Intent，但已经持久提交的 Draft Action 与 Runtime Task 按各自状态继续。

## Operator Model Route

Workspace Operator Kernel 的推理由 Runtime 按 `workspace_operator` 用途从用户已有 Provider/Model Mapping 解析独立 Operator Model Route，可以使用 DeepSeek、其它 OpenAI 兼容 Provider 或本地模型。Secret 只进入对应 Provider Adapter，Operator 上下文只包含脱敏 Intent、最小工作区快照和工具结果；Embedded Plugin 不转发 DeepSeek Harness OAuth/API Key，也不把 Director 主会话当模型代理。

用户首次为某个 ProductionSession 启用计费 Operator Model Route 时，明确设置独立的 Operator Assistance Budget；每个 Intent 单独限制模型 Token、费用、墙钟时间和重试，并把可见用量事实写入 Receipt/Usage Ledger。预算耗尽返回 `OPERATOR_BUDGET_EXHAUSTED` 并暂停新的微规划，不能借用或扩大图片/视频 Run Budget，也不为每个普通 Intent 重复弹窗。

没有可用 Route 时返回明确 `OPERATOR_ROUTE_UNAVAILABLE` 与设置 deep link；External Director 可以改用精确原子命令，但系统不得静默借用另一条模型线路、降级到旧 Browser Agent 或伪造已执行结果。

## 制作组构成（不是 Agent 名单）

| 组件 | 性质 | 生命周期 | 责任 |
| --- | --- | --- | --- |
| Workspace Operator | 唯一内置 AI 角色 | 一个 Crew Intent | 现场理解、受限微规划、工具选择、回执解释 |
| Command Dispatcher | 确定性服务，不是 Agent | 常驻 | Schema、幂等、权限、对象版本与命令路由 |
| Workspace Tool | 类型化工具，不是 Agent | 单命令 | Workflow/Table 查询与可逆写入 |
| Runtime Worker | 持久任务服务，不是 Agent | Task/Run | Provider、渲染、验证、取消与恢复 |
| Review Tool | 可选一次性工具，不是 Agent | 单次调用 | 可调用模型生成结构化评审，但不直接修改权威状态 |

编剧、分镜、视觉连续性和质量判断如果需要额外模型，只作为一次性 Review Tool 返回 Review Result。它们没有人格、主会话、长期目标、独立工具权限或再委派权，因此不计入 Agent 角色。

## Crew Intent

一个 Intent 必须包含：

- `intentId` 与稳定 `idempotencyKey`；
- `projectId`、目标工作区和允许操作的对象/选择范围；
- 一句可验证目标，而不是开放式长期任务；
- 可用 Capability 范围、最大步骤、时限和上下文预算；
- 最大副作用等级；
- Director Binding 与来源 Session ID；
- 完成条件和需要返回的 Receipt 详细度。

缺少项目、目标范围或副作用上限时，制作组拒绝执行，不靠模型猜测。

## 状态机

```text
accepted
  -> inspecting
  -> planning
  -> executing
  -> completed | partial | failed | waiting | cancelled
```

- `inspecting` 只读取完成当前判断所需的最小子图。
- `planning` 只产生当前 Intent 内的短步骤，不创建长期计划文档。
- `executing` 每次只调用一个 Registry 工具并观察真实结果。
- `waiting` 必须包含明确原因：用户 Gate、版本冲突、缺失输入、Capability 不可用或外部通信批准。
- 已经启动的长时 Task 由 Runtime 持有；Intent 可以完成并返回句柄，不让 Operator 持续轮询。

## 微规划预算

默认限制应由策略配置，而不是写死在 Prompt：

- 最大工具步数；
- 最大墙钟时间与模型输出；
- 最大读取对象数与附件总量；
- 允许的 Workspace 和 Command Namespace；
- 是否允许本地 Artifact 操作；
- 是否允许创建 pending Provider Operation；
- 任何付费/发布/不可恢复动作都强制暂停。

预算耗尽返回 `partial` 或 `waiting`，附上已完成动作和剩余建议；不得继续后台自转。

## Workspace Operator Receipt

Receipt 至少包含：

- Intent、Director Binding 与 ChangeSet ID；
- 每个已调用命令的公开摘要和结果；
- 受影响对象、最终 Draft/Object Version；
- Task/Run/Artifact 稳定引用；
- completed/partial/failed/waiting/cancelled 状态；
- 费用事实、待确认项、结构化错误与可恢复建议；
- 事件游标和可重放检查点。

自然语言解释只是附加字段，不能替代结构化状态。

## 外部通信

制作组不拥有任意网络工具。需要向外部系统发送信息时，Director 必须指定已注册 Communication Capability、目标和内容范围；Runtime 做域名/账号/数据分类校验，需要时触发用户 Gate。Operator 只负责准备并调用该类型化能力，不能自己寻找联系人、改变接收方或发送隐藏项目上下文。

## 失败原则

- 单步失败不回滚已产生费用或 Artifact 的事实。
- 可逆 Draft 动作可以按 ChangeSet 撤销；ProviderAttempt 不会因画布撤销而消失。
- 同对象版本冲突拒绝旧动作，不使用最后写入覆盖。
- 工具结果不明确时返回 `submission_unknown` 等封闭状态，不由 Operator 猜成功。
- Operator 崩溃后从 Intent、ChangeSet 和 Runtime Task 恢复，不依赖恢复一段隐藏推理。

## 不允许的形状

- Operator 创建多个长期“部门 Agent”互相聊天。
- Review Tool 获得 Workspace 写权、Production Gate 或 Provider Secret。
- 用一个长 Prompt 模拟预算、权限或状态机。
- 外部 Harness 与 Operator 同时拥有跨任务总体计划。
- 为浏览器、Desktop 和 CLI 分别维护不同制作组工具列表。
