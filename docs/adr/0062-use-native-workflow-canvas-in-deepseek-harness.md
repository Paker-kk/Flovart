# DeepSeek Harness 内置原生 Workflow 画布

## 决策

DeepSeek Harness 保持主壳、原生会话和默认导演权；Flovart 通过 RC8 的 session-scoped `conversation.view` 增加一个原生 React Workflow 画布。画布不加载 Flovart WebUI iframe，也不替换 Harness 的根 `sidebar`、`conversation` 或 `conversation.session`。

首次进入 Flovart Workflow View 时，启动器自动发现并复用兼容的本机 Workspace Operator；服务不存在时只启动工作区命令面，不启动 Codex Managed Agent 或任何第二个主 Agent。工作页只展示准备进度，失败后提供重试和单一修复指引，不把 Runtime 地址、Token 或 Workspace Operator 当成用户连接步骤。

没有已有 Workflow Project 或当前项目为空时，工作页先显示目标式开始页：用户以 Production Brief 建立制作上下文，已有 Draft 则自动恢复，“空白开始”保留为次入口。系统不因进入页面自动制造空项目，也不要求用户先跳转独立 WebUI。

Flovart Workflow View 不提供第二套 Agent 对话或独立会话历史。DeepSeek 主对话是唯一用户指挥入口；Workspace Operator 只以有界执行状态、等待原因和 Receipt 出现在工作页，不以可连接 Agent、联系人或聊天身份出现。

原生画布只调用 Harness Host 提供的受限同源代理；Host 持有 Workspace Token，并只转发健康检查、工作页注册、Workflow 命令与 Director Binding。Workspace Operator 保存一份不含 Provider Secret、原始媒体地址和本地路径的 Native Workflow Draft；画布 UI、DeepSeek 派生工具和命令处理器共享这份权威状态。Provider、Production Gate、Task/Event 和 Artifact 边界保持不变，原生画布不能直接批准付费执行。

Flovart WebUI 仍可独立承担 Table、Provider 设置、媒体恢复和尚未迁移的高级编辑，但不是 Harness 原生画布的启动前置条件。插件不再注册 `sidebar.footer.action` 或任何外部跳转入口，避免在主路径中制造第二套导航。

## 边界

- Host/Cordis half 只通过公开 CLI Registry 派生状态、Director、任务和有界 Workflow 图编辑工具。
- Client half 只消费 Harness 同源代理，不提供 Runtime 地址或 Token 输入框；Token 不进入浏览器，也不写入节点、Draft 日志、工具回执或 Provider 参数。
- 原生 Draft 使用对象 ID、Draft 版本、幂等键和防环连接校验；每次图变更写入本机 Agent 数据目录。
- 付费生成、Production 审批/运行、媒体工具和 Crew Intent 不因画布原生化而绕过既有确认与授权面。
- Harness 崩溃或插件禁用不应中断已经提交的 Runtime Task/ProductionRun；原生画布重新加载后从 Runtime 恢复项目。

## 取舍

这会让 Harness 原生画布与旧 Browser Workspace 的持久化边界暂时分开，避免把 WebUI 的浏览器存储、Provider Secret 或巨型 React 应用强行打包进 DSH。后续如果要让两个表面共享项目，必须通过版本化 Draft Authority Port 做显式导入/切换，不允许在两个 store 之间静默双写。

## 验收

在目标 Harness 兼容集上验证：首次进入无需手填地址或 Token，能够复用或自动启动纯 Runtime/Workspace 且不会拉起 Managed Coding Agent；未绑定项目时显示 Production Brief 主入口以及“打开已有项目”“空白开始”次入口，不自动创建空项目；页面不存在第二套 Agent 对话或历史，Operator 只显示执行状态与 Receipt；原生视图可创建项目和节点、拖拽/缩放/连线、刷新后恢复；DeepSeek 模型可以读取并执行有界图编辑工具；Runtime 不可用时显示可行动错误；WebUI 只作为降级入口；崩溃恢复与升级回滚不改变已提交运行。
