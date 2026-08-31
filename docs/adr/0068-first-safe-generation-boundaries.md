# ADR 0068：首次安全生成使用渐进配置与显式费用授权

## 状态

已接受

## 背景

首次打开 Flovart 的用户需要先看到可编辑的 Workflow，再决定是否配置自己的 AI 服务。生成链路同时必须保证引用语义、Provider 请求、费用提示和失败恢复是一条可观察的路径；仅靠组件 mock 或隐藏的 `confirmed` 字段不能证明这一点。

## 决策

1. 没有 AI 服务时仍允许进入和编辑 Canvas；生成入口提供“添加 AI 服务”的明确设置动作，不用 Provider 错误或空白禁用态阻塞首屏。
2. 普通 OpenAI-compatible 设置以服务地址和 API Key 为最小字段；成功后尝试 `/models` 自动发现模型，发现失败时保留手动模型入口。产品界面使用“AI 服务”和“模型”，适配器、凭据引用和请求序列化只属于内部或诊断面。
3. Graph、PromptBar、`@` Mention 和素材库先汇合为 Canonical Generation Input，再由 Provider Adapter 生成请求。能力不匹配必须在 HTTP 提交前显式失败，Provider 不读取 Canvas 状态。
4. 任何外部生成都经过人工 Execution Gate。批准权由运行时签发的非序列化内部 capability 表示；调用方自带的 `confirmed` 字段不是授权。图片/视频提交仍分别经现有 `WorkflowExecutor` 与 Provider Runtime。
5. 异步 Provider 的 task identity 在开始轮询前写回 Workflow 持久状态；刷新或重载只恢复原 task。重试沿用操作幂等身份，不能因界面重载重复提交。
6. Local Fake Provider 只作为自动验收 fixture，必须通过真实 localhost HTTP transport、可验证的请求录制和脱敏边界；它不代表真实 Provider 的价格、账单、取消或视觉质量。

## 结果

- 首次使用路径从“打开 → 配置 → 发现模型 → 生成”可在没有真实付费凭据的环境中端到端验收。
- Provider 失败、限流、轮询超时和浏览器刷新都有可恢复的产品状态，而不是技术堆栈或无限 loading。
- 安全验证集中在 Gate、Executor、持久 task identity 和 recorder 边界，不新增第二套 Workflow 或 Provider 执行权威。

## 验收

- Fake Provider + 可见 Chromium 覆盖 T2I、I2I、T2V、I2V、401/429/错误地址/超时、重试、幂等重放和刷新恢复。
- 未经真人确认的 Agent `workflow.node.run` 不产生 Provider 请求；原始 API Key 不进入 UI、Agent result、日志或 recorder。
- 真实 Provider 凭据、价格/账单、取消和视觉质量仍须另行验收，不由本 ADR 宣称通过。
