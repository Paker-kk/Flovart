# ADR 0063：DSH 记录会话投影，Flovart Runtime 裁定生产事实

## 决策

在 DeepSeek Harness 集成模式中，Flovart Runtime 是视觉生产事实与执行状态的唯一权威。它负责 Workflow 图及其版本、Production Run、Stage/Provider Attempt、Artifact 元数据、预算与执行状态；Browser Client 只负责画布投影、缓存和 UI 临时状态。

DSH 负责 Agent 生命周期、Session、对话轨迹、Tool Call 和可回放的展示事件。Flovart Runtime 将生产过程投影为带稳定业务 ID 的 Session 事件，DSH 的 Conversation Node 根据这些事件重建 `PresentationState`。Conversation Node、Tool Card 和 DSH Job 都不能反向成为生产状态机，也不能直接写 Workflow 或 Provider。

## 状态所有权

| 状态类别 | 权威 | 允许的下游投影 |
| --- | --- | --- |
| Production Facts | Flovart Runtime | DSH Session、Workflow View、客户端缓存 |
| Agent / Conversation Facts | DSH | Conversation UI、模型下一轮上下文 |
| UI Ephemeral State | Flovart Client | 发送给 Agent 的显式 Context |

P0 只要求把 Workflow graph、Workflow revision、Run metadata 和 Artifact metadata 迁入或接入 Runtime；原始图片、视频、缩略图缓存、viewport、zoom、selection 和面板布局不因本 ADR 被强制搬迁。

DSH `ctx.jobs` 只保存面向 Agent 的监督句柄，例如 `jobId -> flovartRunId`。`job_kill` 通过 Flovart Service 转发取消请求；Provider Job、真实 Run 状态和取消结果仍由 Flovart Runtime 裁定。Agent 或 Harness 断开不自动终止已经提交的 Production Run。

## 后果

- Runtime 必须提供可恢复的状态查询与事件游标，不能只依赖浏览器 IndexedDB 或内存。
- Conversation Node 必须能在 Session 重载后从事件重建，缺少实时订阅时可用 Runtime snapshot 补齐。
- 任何“已完成”“已取消”“已产生 Artifact”的展示都必须有 Runtime 回执或投影事件依据。
- DSH 与 Flovart 之间允许存在短暂投影延迟，但不允许两套状态机互相覆盖。

## 拒绝的方案

- 让 DSH Session log 成为 Provider/Run 的第二数据库。
- 让 Conversation Node 保存一份可写的 `run.status` 并与 Runtime 双向同步。
- 让浏览器当前打开的项目继续作为 DSH Agent 能看到的唯一事实。
