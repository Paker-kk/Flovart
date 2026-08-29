# 权威与职责边界

> 状态：目标设计。本文件定义决策权和状态权，不描述具体进程或 UI 实现。

## 设计原则

两个 AI 角色的区别不是模型大小，而是谁对哪一种决定负责。Production Crew 只是执行组件集合，不是第三个决策者。任何状态只允许一个权威；其他表面只能保存引用、投影或回执。

## 决策权矩阵

| 决定 | 用户 | External Director Harness | Workspace Operator | Runtime |
| --- | --- | --- | --- | --- |
| 最终作品目标与取舍 | 最终权威 | 提案与调度 | 不得改写 | 不参与 |
| 跨镜头/跨任务顺序 | 可干预 | 权威 | 只执行当前 Intent | 校验依赖 |
| 单个 Intent 内工具步骤 | 可取消 | 给出范围/约束 | 受限微规划 | Schema 与状态裁决 |
| Workflow 可逆编辑 | 可直接编辑/撤销 | 发出意图或精确命令 | 执行并回执 | 不替代 Draft Authority |
| Provider Route 选择 | 配置策略 | 请求产品能力 | 不指定秘密线路 | 权威解析 |
| 付费执行 | 明确批准 | 请求方案 | 必须暂停 | 记录并强制 Gate |
| 发布/覆盖外部目标 | 明确批准 | 请求 | 必须暂停 | 记录并强制 Gate |
| 任务状态与费用事实 | 查看 | 读取并判断下一步 | 读取摘要 | 权威 |

## 状态权威矩阵

| 状态 | 唯一权威 | 其他表面保存什么 |
| --- | --- | --- |
| 外部主对话与长程计划 | External Director Harness | Director Session Binding、用户可见摘要和同步游标 |
| Workflow Draft | 当前 Draft Authority | Zustand/UI projection、ChangeSet 引用 |
| ProductionRun/Task/预算/Gate | Production Runtime | 状态 Projection 与稳定 ID |
| Artifact 二进制与来源 | Artifact Store | Artifact ID、预览与内容 Hash |
| Crew Intent | Intent Store | CLI/UI 状态投影 |
| Operator 执行结果 | ChangeSet + Workspace Operator Receipt | Harness 消息中的引用与人话解释 |
| Agent Workspace 布局 | 浏览器本地 Agent Workspace Store | 不影响任务和会话状态 |

## Production Session Workspace 边界

每个 ProductionSession 向其 Active Director Harness 提供一个隔离的本地项目根目录，使本地 Coding Agent 可以像操作普通项目一样读取 Brief、当前 Spec/Draft 摘要、Capability/Artifact 引用和已确认决策，并把临时推演与交付文件写入 scratch/exports。Flovart 生成的上下文文件都是带版本/Hash 的只读 Projection；编辑这些文件不能修改 Draft、ProductionRun、Gate 或 Artifact 来源，正式变更必须经过 CLI、Authority Port 与对应授权。

工作目录不得包含 Runtime SQLite、Discovery Token、Provider Secret、Artifact Store 内部路径或完整 Harness Transcript。切换 ProductionSession 时同步切换目录与一对一 Director Binding；Skill 源码开发另开 Skill Authoring Session，不能借 Production Mode 获得 Flovart 源码仓库或任意用户目录。

## Director Authority

External Director Harness 拥有：

- 用户主对话、Brief 解释与长期上下文；
- 总体目标拆解、优先级和跨任务依赖；
- 是否采用 Review Result、是否重新规划、是否停止；
- 对 Flovart Receipt、Artifact 和错误的最终语义判断；
- 将一个有界 Intent 委派给制作组，或直接调用精确 CLI 命令。

它不拥有 Flovart 的 Workflow/Runtime 数据，也不能用自然语言回复冒充已执行结果。

## Operator 与执行面 Authority

Workspace Operator 只拥有当前 Intent 的微规划权；Dispatcher、Runtime 与 Worker 按 Schema 执行和裁决，它们不是 Agent。整个 Production Crew 只拥有当前 Intent 的执行权：

- 在指定项目、对象范围和副作用等级内读取必要现场；
- 选择 Registry 中已注册的少量工具与执行顺序；
- 对可逆步骤重试、对版本冲突重读最小子图；
- 产生 completed、partial、failed、waiting 或 cancelled Receipt；
- 把长时任务交给 Runtime 后结束模型等待。

它不能扩大目标范围、创建长期子项目、换 Production Skill、修改预算、决定发布或向任意外部目标发送内容。

## User Gate

以下决定永远不能由“导演台是主 Agent”推导为自动授权：

- Provider 计费或扩大已批准预算；
- 冻结 Draft 为 ProductionSpec Revision；
- 发布、覆盖外部文件/账号或发送给第三方；
- 删除不可恢复数据；
- 安装带代码执行能力的 Toolkit Plugin；
- 向新的外部域名传输素材或项目上下文。

Agent Tool Approval 与 Production Gate Approval 是两套权威。外部 Harness 获得 Shell 权限，不代表它获得 Flovart 的预算或发布权限。

## 冲突场景

### 用户在 Operator 执行时修改同一节点

Draft Authority 拒绝过期 `expectedObjectVersion`。Operator 只重读冲突对象；若新状态仍满足 Intent，生成最小新动作，否则返回 `waiting`，由导演台或用户决定。

### 外部 Harness 切换

旧 Harness 会话保持在原宿主，Flovart 归档旧 Director Session Binding，生成不含聊天和隐藏推理的 Director Handoff Snapshot。新 Harness 成为唯一 Active Director Binding 后才能提交新的 Director Intent；已持久化 Runtime Task 不随宿主切换终止。

### Operator 已提交 Provider Task 后被取消

取消只停止继续微规划。Runtime 根据 Provider 是否支持取消决定远端状态；在确认远端取消前不得伪造 `cancelled`，已产生费用和 Artifact 继续保留。

### 外部 Harness 失联

ProductionRun 继续由 Runtime 推进。Flovart UI 显示 Director Binding 断开、Crew/Runtime 的真实状态和需要人工处理的 Gate；不会启动内置主聊天接管导演权。
