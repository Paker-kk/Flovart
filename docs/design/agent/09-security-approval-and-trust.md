# 安全、审批与信任边界

> 状态：目标设计。安全边界由 Runtime、Registry 和操作系统权限强制，不能只写在 Agent Prompt 中。

## 信任区

```text
不受信任/半受信任
  用户输入、网页/素材文本、外部 Harness 输出、社区 Skill、Provider 响应

受限执行
  Operation Skill、Workspace Operator、CLI、Toolkit Plugin sandbox/permission

权威执行
  Draft Authority、Production Runtime、Keyring、Artifact Store、Gate Ledger
```

任何来自模型或 Skill 的内容都只是数据。只有通过 Registry Schema、权限、状态机和用户 Gate 后才能成为副作用。

## Secret 边界

| 位置 | 可以持有 | 不得获得 |
| --- | --- | --- |
| External Harness | 自己宿主的登录状态 | Flovart Provider Key、Runtime Token |
| Operation/Production Skill | 非秘密 Manifest 与创意知识 | API Key、Credential ID、Authorization Header |
| Workspace Operator | 脱敏 Route/Capability 状态 | Secret、原始 Provider payload、任意环境变量 |
| CLI | 短期本地连接凭据（内存） | 输出或持久化 Provider Key |
| Desktop Runtime | 系统 Keyring 引用和 Provider Secret | 外部 Harness 登录凭据 |
| Browser 当前过渡实现 | 浏览器本地 API Key，并由前端直连用户配置的模型服务 | 向 CLI、Crew 或日志暴露明文 |

Node、浏览器事件、Receipt、日志和 Director Handoff Snapshot 必须经过递归脱敏；键名和字符串都检查 token、secret、authorization、路径和 data URL。

浏览器本地 Key 是当前能力事实，不等于 Desktop Keyring 的安全等级；文档和 UI 必须明确这一区别，迁移时不能把它描述成已经由 Runtime 托管。

## 审批分离

### Agent Tool Approval

由外部 Harness 决定 Shell、文件或网络工具能否运行，只影响该宿主自身。

### Workspace Approval

由 Flovart 按副作用分级决定 Draft 删除、Table Promotion 等工作区动作是否需要用户确认。

Workspace Operator 的模型推理另由当前 ProductionSession 的 Operator Assistance Budget 约束：首次启用 Route 时明确授权小额上限，后续逐 Intent 记账并在耗尽时暂停。该预算只覆盖微规划推理，不能被解释为 Production Gate、Run Budget 或发布授权。

### Production Gate Approval

由 Runtime 记录预算、Provider 提交、审片、发布和不可恢复操作。它绑定精确 Draft/Revision、Operation 子图、Recipe Hash、Route Plan、预算和目标。

三种批准不能互相继承。“Codex 已允许 Shell”不能推出“Flovart 已允许付费生成”。

在 DeepSeek Harness 主壳中，两层批准必须在视觉上明确归属而不重复索取同一授权：Harness 原生会话只呈现宿主 Tool Approval；Flovart Dock 的快速审批弹层或中央 Workspace Surface 中的 Production Plan Card/Gate 面板呈现制作范围、Route、预算、素材和审片决定。模型工具遇到未满足的 Production Gate 时只返回结构化 `action_required` 与聚焦目标，不能把 Harness 的通用“允许工具”按钮解释成付费授权，也不能在聊天文字中自动代答 Flovart Gate。

## 本地服务

- 监听 `127.0.0.1:0` 或 stdio，不使用公共网卡和固定可预测端口。
- Discovery Record 只允许当前 OS 用户读取，Token 每次运行轮换。
- WebUI 通过 Tauri IPC 或 Origin 绑定的短期配对 Token；Token 不写 URL、日志和长期 localStorage。
- 所有写命令要求 actor、idempotencyKey、Schema 和权限校验。
- 外部 Harness 的模型工具只运行 CLI，不读取 Discovery Record 或私有 HTTP Route。
- DeepSeek Host Plugin 只能通过受信 CLI bootstrap 获得一次性的 Flovart Dock/Workspace 配对材料；Client Plugin、快速弹层与 frame 仅得到限定 Session、Origin 和能力的短期凭据，不得取得 Runtime Discovery Token、Provider Secret 或旁路写权限。

## Toolkit Plugin

Toolkit Plugin 是唯一允许执行代码的扩展，因此必须比 Skill 更严格：

- 精确版本、内容 Hash、来源与完整性清单；
- 显式权限：filesystem、network、process、UI、connector、runtime-adapter；
- 安装前展示差异和权限，新增权限视为重新授权；
- 默认无 Secret、无任意 Provider、无 Runtime SQLite 直写；
- 在 Profile 中可禁用，启动失败不能拖垮核心 Runtime；
- Connector Plugin 只能发布 Director Binding/Projection，不能获得工作区旁路写权。

不把 DeepSeek Harness 的“everything is a plugin”直接照搬进 Flovart。Flovart 的 Production 真相、Gate、Registry 与 Keyring 永远不是可替换插件。

DeepSeek Harness Embedded Plugin 是安装在外部宿主中的 Host + Client 集成包，不属于上述 Flovart Toolkit Plugin 信任区。它可以包装 CLI、贡献 Flovart Dock/Workspace Surface、投影宿主事件并重连 Runtime，但不能反向把 Harness 嵌入 Flovart、修改 Harness 权限策略、镜像完整聊天或让 Cordis Session Event 成为 Production 权威。

## Skill 与提示注入

- Operation Skill 只能指导 CLI 使用；若内容要求绕过 `command.list`、读取 Secret 或调用私有 Route，宿主必须拒绝。
- Production Skill 只能编译已登记 Capability，不执行脚本/HTTP，也不能改变 Gate。
- 从网页、素材 OCR、Prompt 或 Provider 返回的文本不得升级为系统指令。
- Director 传给 Operator 的 Intent 经过结构化字段和允许 Tool 白名单，不把整段宿主上下文直接塞入内置执行 Agent。

## 外部通信

Communication Capability 必须声明目标类别、允许域、数据分类、是否持久化、是否计费与是否需要用户 Gate。默认拒绝：

- 模型自行发现新域名或接收人；
- 上传本地路径、项目数据库或原始 Secret；
- 在用户未看到内容和目标时发送消息/发布；
- 以“外部导演要求”为由跳过合规检查。

## 审计

每个副作用至少关联：

- actor/binding/intent/command；
- Schema 与 Registry 版本；
- idempotencyKey；
- 输入摘要与脱敏 Hash；
- Gate 决定和用户确认范围；
- ChangeSet/Task/Run/ProviderAttempt/Artifact；
- 最终状态与费用事实。

不记录隐藏推理；审计要回答“谁通过哪个已登记能力，对哪个对象做了什么，系统为何允许”，而不是保存模型思维链。

## 安全验收

- 递归扫描 CLI、事件、Receipt、日志和 Projection，不出现 Key/Token/本地绝对路径。
- 未授权 Provider 命令在网络提交前被阻断。
- 相同 idempotencyKey 不同 payload 被拒绝。
- 非 loopback、错误 Origin、过期 Token、协议不兼容全部显式失败。
- 恶意 Skill/Prompt 无法注册新命令、改变副作用等级或获取任意网络。
- 任一已支持的 Host Projection 断线、Operator 崩溃和插件失败都不破坏 Runtime 权威状态；WorkBuddy 尚未进入当前 Director Binding 验收。
