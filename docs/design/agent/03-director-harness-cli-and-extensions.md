# 外部导演 Harness、CLI 与扩展

> 状态：目标设计。外部 Coding Agent 的共同公开产品接口是 Operation Skill + CLI；不暴露 MCP Server。DeepSeek Harness 继续作为用户主壳，并通过可卸载的 RC8 Bundle 在原生会话中追加单一 Flovart Workflow View 与轻弹层，不改变模型工具的 CLI 权威。

## 独立生命周期

External Director Harness 由用户安装、登录、启动和退出。Flovart 可以帮助安装 Operation Skill、连接描述或一个可选 Harness 发行包，但不把外部进程变成 Desktop 的子进程所有物：

- `flovart start` 启动或发现 Flovart Runtime、WebUI 和 Production Crew；
- Harness 在自己的终端、桌面应用或 WebUI 中独立运行；
- Harness 调用 `flovart ... --json` 并保存自己的主会话；
- 关闭 Flovart UI 不杀死 Harness，关闭 Harness 也不终止持久 ProductionRun；
- Flovart 不替外部宿主管理 OAuth/API Key，也不复制其 `auth.json` 等登录状态。

DeepSeek Harness 是首个完整插件宿主：用户从专用 Flovart DeepSeek Profile 进入原生 Harness 主壳和主会话；Node/Cordis 插件可以通过受信 CLI bootstrap 启动或发现独立 Flovart Runtime，Client Plugin 在 `conversation.view` 中注册唯一 Flovart Workflow View，并可用 `shell.overlay` 提供轻量状态/审批/Artifact 弹层与独立窗口降级。该 Profile 关闭、重载或升级后，已提交 ProductionRun 继续运行；恢复时用 Director Binding 与事件游标重连，不把 Runtime 放进 Cordis Session 生命周期。

## CLI 公开边界与宿主私有嵌入通道

所有 Coding Agent Projection 的模型调用共同只使用：

1. 随宿主安装的 Flovart Operation Skill，学习正确工作流与安全边界；
2. `flovart` / `npx flovart-cli` 的机器可读命令；
3. CLI 返回的 JSON/JSONL、稳定错误码、Task/Receipt ID 与 Artifact 引用。

外部 Harness 的模型调用不直接访问 loopback 私有 Route，不解析 WebUI，不使用 CDP，不读取 Discovery Token，也不通过 MCP 获得另一套工具面。CLI 内部可以连接 Local Control Protocol，但这个传输细节不向模型工具泄漏。

DeepSeek Harness Embedded Plugin 是安装进 Harness 的宿主侧适配器，而不是把 Harness 嵌入 Flovart，也不是第二套模型工具协议。Node/Cordis 侧使用稳定的 Agent 工具面调用 CLI；只有在 bootstrap、兼容诊断或调试时才读取 `command.list` / `command.schema`，不能在每个模型回合动态展开第二套工具。Client Plugin 的 Workflow View、轻弹层、实时事件、聚焦和恢复可以通过隔离的版本化 Local Control Protocol Client 访问短期配对通道。插件禁用或版本不兼容时退回 Operation Skill + CLI + 独立 WebUI，不能拖垮 Runtime 或改变 Production Authority。

## CLI 命令族

现有命令继续以 `command.list` 和 `command.schema` 为事实源。目标能力按以下命令族收敛；未进入 Registry 且没有实现/测试的命令只能写在设计中，不能出现在 Operation Skill 示例里。

| 命令族 | 用途 |
| --- | --- |
| `install` / `update` / `doctor` | 安装校验、升级与诊断 Agent Toolkit |
| `start` / `web.open` / `status` | 启动/发现 Flovart 服务并打开 WebUI |
| `command.list` / `command.schema` | 机器发现，不依赖旧示例猜命令 |
| `workspace.*` | 检查并精确操作当前可见工作区 |
| `production.*` / `task.*` / `artifact.*` | 计划、审批、执行、恢复和交付 |
| `director.bind/status/unbind` | 绑定外部宿主的非秘密会话身份与能力摘要 |
| `crew.intent.*` / `crew.receipt.*` | 提交有界制作意图、取消、查询和读取回执 |
| `event.watch --jsonl` | 长连接观察事件；断线后用游标恢复 |
| `skill.*` | 管理 Operation/Production Skill 包与 Hub |
| `profile.*` / `plugin.*` | 管理本地 Toolkit 组合与受信任代码扩展 |

## Agent Toolkit Profile

Profile 是 Agent Toolkit 的本地组合配置，不是新的 Agent 人格。它只选择：

- 启动 WebUI、TUI 或 headless 观察模式；
- 启用哪些签名/本地受信任 Toolkit Plugin；
- 默认加载哪些 Operation Skill 或 Production Skill 目录；
- 安全策略、端口发现和日志级别等非秘密偏好。

Profile 不保存 Provider Secret、不决定作品目标、不覆盖 Production Gate。配置应支持 `list/show/validate`，并能在不启动服务时输出合成后的脱敏结果。

## Flovart DeepSeek Profile

Flovart DeepSeek Profile 是 DeepSeek Harness 的专用命名组合，与上面的 Agent Toolkit Profile 不是同一概念。它按受支持版本装配 DeepSeek Harness 官方基础/Web Bundle、Flovart Bundle、Operation Skill 和必要的 `cordis.patch.yml` 配置层，并由 `dsh --profile flovart` 启动；安装与升级不得改写用户已有 `web`、`headless` 或其它 profile。

采用专用 Profile 是因为 Node/Cordis 工具适配、单一 Workflow View、轻弹层与配对服务必须作为一套已验证组合加载。Flovart 不 Fork 或反向包装 DeepSeek Harness，也不把媒体制作依赖塞进通用 DeepSeek profile；Profile 的合成配置必须可通过 `--dump-config` 检查。若某个 Harness 版本没有兼容的 `conversation.view` / `shell.overlay` 扩展点，该版本不以修改核心源码硬接入，而是显式退回独立窗口或 CLI-only 路径。

### RC8 精确兼容契约

首个设计与验收基线固定为官方 [`dsh-v0.1.0-rc.8`](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.0-rc.8)，不是模糊的 `latest` 或未来 `0.4.x`。RC8 仍是 developer preview；后续 RC 即使能启动，也必须建立新的兼容集并重新验收。

- Flovart 发布的安装单元声明 `dsh.bundle` 并贡献 `cordis.patch.yml`；用户 Profile 由 `$DSH_HOME/profiles/flovart/package.json` 中的 `dsh.profile.bundles` 按序组合。安装、检查与启动分别使用 `dsh plugin --profile flovart add <package>`、`dsh --profile flovart --dump-config`、`dsh --profile flovart`。
- 浏览器包在 `package.json` 声明 `dsh.client: { platform: "web", ... }`，并从 `exports["./client"]` 导出已构建 bundle；只写自定义 `assembly.json` 不会被 RC8 发现。
- “Host Plugin + Client Plugin”是 Flovart 的职责拆分，不是 RC8 的两种 manifest 类型：实际发行物是一个 Bundle，引用普通 Node/Cordis 插件和一个声明 `dsh.client` 的浏览器入口。
- RC8 根 `sidebar`、根 `conversation` 与 `conversation.session` 都是排他 Slot，Flovart 不注册这些位置。完整 Workflow 只注册为附加 `conversation.view`；审批、状态与 Artifact 只注册为附加 `shell.overlay`。
- Flovart 不注册 `sidebar.footer.action` 或外部跳转按钮；用户只通过会话原生 View Tabs 进入工作页，避免形成第二套导航。
- Client Plugin 在 DSH React 树中直接渲染原生 Workflow View，不使用 iframe。浏览器只调用 Harness Host 的受限同源 Workspace 代理，插件页面不包含自己的左侧导航、Table、Agent Production Control、Agent Bridge、首页或设置页。
- RC8 根包要求 Node `^22.19.0 || >=24.0.0`；兼容集验收同时锁定 Node、Harness tag/commit、Flovart Bundle、Runtime/WebUI、协议与 Operation Skill Hash。

### 首次启动

专用 Profile 检测不到兼容 Flovart Runtime 时，先展示将安装的 Flovart 版本、发布来源、下载体积、完整性与代码执行权限；只有用户明确确认后，Node/Cordis 插件才调用与 `npx flovart` 相同的 Agent Bootstrapper 下载、校验并启用 Runtime Release Bundle，然后启动、配对并启用 Workflow View。取消安装后仍可使用 DeepSeek Harness 本身，Profile 不伪造已连接状态。

npm Profile/Plugin 只携带宿主适配代码、配置和 Operation Skill，不内嵌所有平台 Runtime/WebUI，也不静默执行安装或升级。已有协议兼容 Runtime 优先复用；发现不兼容实例时并列显示当前/所需版本与 CLI-only 恢复动作，不覆盖正在运行的版本。

### 升级与回滚

Flovart 为专用 Profile 发布经过实测的兼容集 Manifest，至少锁定 DeepSeek Harness tag/commit、Node 范围、Profile Bundle、Node/Client 入口、Flovart Runtime/WebUI 协议和 Operation Skill 版本/Hash。检测到新兼容集时只提示差异、破坏性变化、下载与权限变化；用户确认后先并行安装和验证，再原子切换 Profile 指针，不在原目录覆盖当前可用组合。

升级失败、健康检查失败或启动后协议握手失败时自动恢复上一兼容集，并保持独立 Runtime 与 ProductionRun 不变。不得后台跟随 DeepSeek Harness 最新版；安全撤销可以阻止新的 Session/Run，但仍需提供导出、CLI-only 诊断和受控回滚入口。

## 三类扩展必须分开

| 类型 | 载体 | 是否执行代码 | 权限 |
| --- | --- | --- | --- |
| Operation Skill | `SKILL.md` 与引用资料 | 否 | 指导外部 Harness 调 CLI |
| Production Skill | Manifest、创意知识、Schema、Eval | 否 | 编译制作方法，只组合已登记 Capability |
| Toolkit Plugin | 受版本和完整性约束的安装包 | 是 | 只扩展明确 Connector、UI 或 Runtime Adapter 接口 |

“插件可安装”不等于“Production Skill 可执行任意脚本”。社区 Production Skill 永远不能借插件机制获取 Shell、网络、Secret 或 Provider 直连权限。

## Coding Agent Projection 与 Mainstream Host 边界

不再把 Agent Identity、IDE、Distribution Target 与 Runtime Binding 合并为“正式 Harness 列表”。当前模型是：

| Projection | 当前角色 | 共同基线 | 额外边界 |
| --- | --- | --- | --- |
| Codex | 当前 professional golden path | Operation Skill + CLI stable surface | 先做真实 inspect/apply/run 与 Session 恢复验收 |
| DeepSeek Harness | Coding Agent + 显式 native Plugin projection | Operation Skill + CLI stable surface | native Workflow 与 Browser Workflow 必须显式分界 |
| CodeBuddy Code | Coding Agent CLI compatibility projection | Skill + CLI contract | 不与 WorkBuddy 共用 Host Identity |
| Claude Code / OpenCode / Pi | Coding Agent compatibility projection | Skill + CLI contract | 宿主会话/事件连接按需增加，不进入 Core |
| WorkBuddy | 未来 mainstream、skill-mediated projection | 待独立产品路径验证 | 不加入 `director.bind`，不阻塞当前 Surface Simplification |

`host.list` 发现 Agent Identity，`init --target` 安装 Distribution Target，`director.bind` 只处理已实现的 Runtime Binding。`command.list` / `command.schema` 是 CLI bootstrap/discovery/debug 能力，不是模型工具的第二集合。

宿主私有 SDK、app-server 或插件协议只能作为可卸载 Host Projection 的实现细节，不能成为 Flovart Core 或 Workflow Core 的业务依赖。

> **Pi 名称边界**：表中的 Pi 是独立运行的外部 Pi Coding Agent Harness。当前仓库依赖的 `@earendil-works/pi-agent-core` 只是旧内置实现包；目标 Workspace Operator 不以“PI”作为产品角色名。

## Agent Bridge

Agent Bridge 只保留在独立 Flovart Agent Workspace，用于展示已发现的 Host Projection、Session 与能力状态，并负责显式 Director Handoff。它不作为 DeepSeek 插件页面嵌入，也不占用 DSH 的右侧 `details` Slot。DeepSeek Workflow View 只显示当前 Binding 摘要；需要换导演时打开独立 Flovart Agent Workspace 或执行结构化 Handoff 命令。

Agent Bridge 不是聊天聚合器、模型路由器或多 Agent 团队。它不镜像完整对话、不自动把一个 Harness 的消息广播给其它 Harness，也不让多个宿主共享同一写租约；需要互通的内容只通过 Director Handoff Snapshot、Artifact/Receipt 引用和用户明确发送的结构化任务传递。

## 一次典型调用

```bash
flovart command.list --json
flovart workspace.status --json
flovart director.bind --agent-identity codex --session-id <opaque-id> --json
flovart crew.intent.submit --intent-json <bounded-intent> --idempotency-key <stable-key> --json
flovart event.watch --after <cursor> --jsonl
flovart crew.receipt.get --intent-id <id> --json
```

这是目标命令形状，不是当前实现声明。迁移期必须先查询 Registry；未登记命令返回 `UNKNOWN_COMMAND`，不能回退旧 file queue、shadow state 或私有 HTTP。
