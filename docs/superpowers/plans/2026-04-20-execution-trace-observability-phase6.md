# Execution Trace + Observability + Whiteboard/Plugin Linkage Phase 6 Plan

> 目标：在 P1~P5 之后，补齐整套产品的运行可观测性、任务追踪、调试面板，以及你原本白板项目与插件（浏览器扩展）之间的联动语义，特别是 **共享 API Key、共享任务上下文、共享生成结果、统一运行 trace**。
>
> 本阶段只做规划，不写代码。

---

## 0. 先说结论

你现在已经有三块基础，但它们还没有形成完整的“运行观测系统”：

### 已有的基础
1. **Web 白板运行时 API**
   - `window.__flovartAPI` 已暴露，见 [App.tsx:1898-1917](App.tsx#L1898-L1917)
   - 已支持 `session / command / progress / canvas / generate / view / config`
   - 但现在仍偏“最小闭环协议”，不是产品级 trace 系统

2. **Workflow/生成链路已有 progress callback**
   - `workflowEngine.ts` 已有 `onProgress / onNodeComplete / onError`，见 [services/workflowEngine.ts:27-32](services/workflowEngine.ts#L27-L32)
   - `aiGateway.ts` / `geminiService.ts` 也有 provider 级进度上报
   - 但这些信息没有统一汇聚成“用户可见的 trace”

3. **插件与白板已有桥接**
   - 扩展用 `chrome.storage.local` 存 `flovart_api_keys_v2`
   - Web 端通过 [hooks/useApiKeys.ts](hooks/useApiKeys.ts) 与 `chrome.storage` 双向桥接
   - 扩展可通过 `FLOVART_COMMAND` → content → `__flovart_command` → `window.__flovartAPI` 下发命令，见 [extension/background/service-worker.js:112-151](extension/background/service-worker.js#L112-L151) 和 [extension/content/content.js:7-21](extension/content/content.js#L7-L21)

### 现在的问题
这些链路虽然都有，但它们现在更像：
- 可用的点状能力

而不是：
- 一套统一的观测、任务、同步、会话系统

所以 P6 的核心目标不是“再多打几个 log”，而是：

> **建立统一的 Runtime Trace + Session + Bridge Observability 层，让 Web 白板、Workflow、Storyboard、插件、运行时 API 能被一致追踪、一致理解、一致调试。**

---

## 1. P6 的目标边界

P6 完成后，产品应具备：

1. 有统一的 **Runtime Session** 概念
2. 有统一的 **Command / Job / Trace** 数据结构
3. Web 白板、Workflow、Storyboard、插件发起的任务都能落进同一个 trace 系统
4. 能查看任务：
   - 谁发起的
   - 用了哪个 provider/model
   - 当前进度
   - 成功/失败
   - 错误原因
   - 输出去了哪里（canvas/assets/storyboard）
5. 插件与白板之间 API Key 的共享语义清晰可观测
6. 扩展侧命令、白板侧命令、workflow node 运行，都能被统一记录
7. 有一个“开发/诊断/trace 面板”可供排查问题

### 本阶段不做
- 云端 observability 平台
- 远程日志上传
- 多设备同步
- 完整 analytics 平台

---

## 2. 当前系统现状诊断

## 2.1 Web 运行时 API 其实已经有 session/job 雏形
从 [App.tsx:1800-1897](App.tsx#L1800-L1897) 看，当前 `window.__flovartAPI` 已经有：
- `session.create/get/list`
- `command.send/get/list`
- `progress.query`
- `canvas.*`
- `generate.image`

### 说明
你已经有一个“轻量任务系统”的雏形。

### 问题
它还不够完整：
- `generate.video` 仍未对齐文档（之前已发现）
- `command.send(generate.image)` 存在“假成功”风险，文档自己也承认，见 [docs/PHASE2_RUNTIME_API.md](docs/PHASE2_RUNTIME_API.md)
- 现在的 job 数据更偏 protocol，不是可观测 trace

---

## 2.2 Workflow 有 progress，但没有真正的 execution trace 面板
[services/workflowEngine.ts](services/workflowEngine.ts) 已经有：
- `onProgress`
- `onNodeComplete`
- `onError`

### 但问题是
这些回调还没真正沉淀成：
- Timeline
- Node-by-node trace
- 输入/输出快照
- provider 请求阶段
- retry / cancellation 记录

### 结果
用户能看到“跑了”，但看不到“怎么跑的”。

---

## 2.3 插件与白板已经共享 Key，但语义不完整
现状：
- 扩展和白板通过 `flovart_api_keys_v2` 共享 key
- Web 白板会把 key 同步进 `chrome.storage.local`，见 [hooks/useApiKeys.ts:363-421](hooks/useApiKeys.ts#L363-L421)
- content/background 会直接读它，见 [extension/content/content.js:130-139](extension/content/content.js#L130-L139) 和 [extension/background/service-worker.js:83-99](extension/background/service-worker.js#L83-L99)

### 这说明什么
说明技术上已经有“共享 API Key”能力。

### 但问题在于
还缺这些语义层：
- 当前白板是在 extension-hosted 页面还是独立网页？
- 当前是否已接入 chrome bridge？
- 当前 key 是从 web 本地 vault 来的，还是从 extension 来的？
- 如果同步失败，用户能不能知道原因？
- 插件命令是否使用了和白板同一套 active key/model 偏好？

### 结论
P6 应该把“共享 Key”从隐式机制变成可见语义。

---

## 2.4 插件命令链缺少统一 trace
当前命令链路是：

```text
Popup / Background / External Message
  ↓
FLOVART_COMMAND
  ↓
content.js
  ↓
window.postMessage(__flovart_command)
  ↓
window.__flovartAPI
```

### 问题
这条链里任何一个环节挂了：
- 当前多半只返回一个 error string
- 没有 trace id
- 没有链路分段状态
- 没有“失败发生在哪层”的可视化

### 结论
P6 必须给 bridge 层也加 trace。

---

## 3. P6 的总体设计

建议引入四层：

```text
Runtime Session Layer
    ↓
Command / Job Layer
    ↓
Trace / Event Layer
    ↓
Diagnostic UI Layer
```

### 1. Runtime Session Layer
负责：
- 当前运行上下文
- 发起者（canvas/workflow/storyboard/extension/external）
- 关联 job 列表

### 2. Command / Job Layer
负责：
- 每次命令发起
- 当前状态
- 输入参数快照
- 输出引用

### 3. Trace / Event Layer
负责：
- provider progress
- workflow node events
- bridge hops
- errors/retries/cancel

### 4. Diagnostic UI Layer
负责：
- 查看 session/job/trace
- 查看 key sync 状态
- 查看 bridge 状态
- 查看 command 失败点

---

## 4. 推荐新增的数据模型

建议新增 `types/runtimeTrace.ts`：

```ts
export type RuntimeSource =
  | 'canvas'
  | 'workflow'
  | 'storyboard'
  | 'extension-popup'
  | 'extension-background'
  | 'extension-content'
  | 'external-client';

export type RuntimeJobStatus =
  | 'queued'
  | 'running'
  | 'success'
  | 'error'
  | 'cancelled';

export type TraceEventLevel = 'info' | 'warn' | 'error';

export interface RuntimeSessionRecord {
  sessionId: string;
  name: string;
  source: RuntimeSource;
  createdAt: number;
  lastActiveAt: number;
  linkedBridge?: 'none' | 'chrome-storage' | 'runtime-api';
  keyContext?: {
    sharedWithExtension: boolean;
    activeProvider?: string;
    activeModel?: string;
  };
}

export interface RuntimeJobRecord {
  jobId: string;
  sessionId: string;
  source: RuntimeSource;
  command: string;
  status: RuntimeJobStatus;
  createdAt: number;
  updatedAt: number;
  inputSummary?: Record<string, unknown>;
  outputRef?: {
    canvasElementIds?: string[];
    assetIds?: string[];
    shotId?: string | null;
  };
  error?: string | null;
}

export interface TraceEventRecord {
  id: string;
  sessionId: string;
  jobId?: string;
  nodeId?: string;
  level: TraceEventLevel;
  stage: string;
  message: string;
  timestamp: number;
  meta?: Record<string, unknown>;
}
```

### 为什么这么设计
因为你要统一的是：
- workflow 节点 trace
- provider progress
- extension bridge trace
- canvas/job trace

这些必须能共存在一个模型里。

---

## 5. 推荐新增文件结构

### 新增

```text
types/runtimeTrace.ts
services/runtimeTraceStore.ts
services/runtimeBridgeState.ts
components/diagnostics/TracePanel.tsx
components/diagnostics/TraceTimeline.tsx
components/diagnostics/SessionInspector.tsx
components/diagnostics/BridgeStatusCard.tsx
components/diagnostics/KeySyncStatusCard.tsx
components/workspaces/DiagnosticsWorkspace.tsx
```

### 修改

```text
App.tsx
services/workflowEngine.ts
hooks/useGeneration.ts
hooks/useApiKeys.ts
components/RightPanel.tsx
components/NodeWorkflowPanel.tsx
extension/content/content.js
extension/background/service-worker.js
extension/popup/popup.js
```

---

## 6. Runtime Trace Store 规划

建议新增：

```text
services/runtimeTraceStore.ts
```

### 职责
- 统一存储 `sessions / jobs / traceEvents`
- 提供 append / update API
- 支持内存态 + 本地持久化（只保留最近 N 条）

### 推荐 API

```ts
createSession(...)
upsertJob(...)
appendTraceEvent(...)
completeJob(...)
failJob(...)
listSessions()
listJobs(sessionId?)
listTraceEvents(jobId?)
```

### 为什么要单独抽出来
因为这不能继续塞进 [App.tsx](App.tsx) 的 runtime api useEffect 里。

---

## 7. 白板与插件联动规划

这是你特别要求补的重点。

## 7.1 共享 API Key 的平台语义
P6 要明确三件事：

### 场景 A：扩展宿主中的白板页面
- Web app 运行在 extension 环境
- `chrome.storage.local` 可直接访问
- key 应视为“共享已启用”

### 场景 B：普通独立网页版白板
- 没有 `chrome.storage`
- 只能用本地 vault
- key 共享不可用或部分可用

### 场景 C：插件主动推送到白板
- 通过 runtime API / postMessage 发命令
- 同时希望复用白板当前 active key/model 偏好

### P6 的要求
用户必须能看见当前处于哪种模式。

---

## 7.2 新增 `BridgeStatusCard`
在 diagnostics 或 settings 中增加：

- 当前环境：`Extension-hosted / Standalone Web / Tauri`
- chrome.storage：可用 / 不可用
- runtime bridge：已连接 / 未连接
- API key sync：正常 / 未开启 / 失败
- 最后一次同步时间

### 为什么很重要
因为现在“共享 API Key”是隐式机制，用户容易误判。

---

## 7.3 新增 `KeySyncStatusCard`
显示：
- key 来源：`vault / chrome.storage / merged`
- 当前 active provider/model
- 最后同步成功时间
- 最近同步错误

### 这可以回答用户最在意的问题
> “插件上输的 key，白板到底有没有同步过来？”

---

## 7.4 扩展命令链加 trace id
P6 应该让每个 `FLOVART_COMMAND` 都带：

```ts
traceId
sessionId
source
issuedAt
```

在：
- background
- content
- web runtime api

三层都记录一个 trace event。

### 结果
命令失败时，你能知道：
- 是 background 没找到 tab
- content 没拿到回应
- 还是 web runtime method 不存在

---

## 8. Workflow Trace 规划

## 8.1 Workflow 每个 node 都应该发 trace event
当前已有：
- `onProgress`
- `onNodeComplete`
- `onError`

P6 应该把这些统一写入 `runtimeTraceStore`。

### 事件示例
- `node:queued`
- `node:running`
- `provider:request:start`
- `provider:poll`
- `provider:download`
- `node:success`
- `node:error`

### 为什么要更细
因为“running”太粗了，真正排查问题时不够用。

---

## 8.2 Provider progress 统一映射
当前：
- `aiGateway.ts` / `geminiService.ts` / `runningHubService.ts` 都有 provider 自己的 progress message

P6 应该做一个统一映射层：

```ts
normalizeProgressEvent(provider, rawMessage) => {
  stage,
  message,
  severity,
}
```

### 作用
- TracePanel 看起来不会像杂乱日志
- 不同 provider 的进度能被放进同一条时间线里

---

## 9. Runtime API 协议升级建议

当前 [App.tsx:1831-1856](App.tsx#L1831-L1856) 已经有：
- `command.send`
- `command.get`
- `command.list`
- `progress.query`

### P6 建议新增

```ts
trace: {
  list: (jobId?: string) => TraceEventRecord[]
}
bridge: {
  status: () => BridgeStatus
}
keys: {
  status: () => KeySyncStatus
}
```

### 这样外部脚本、插件、技能都能读到：
- 当前任务执行到了哪
- 当前 bridge 是否在线
- 当前 key 是否共享成功

---

## 10. Diagnostics Workspace 规划

建议在 P1 的 workspace bar 上最终加一个隐藏或开发态入口：

```text
Diagnostics
```

或者先不加主 tab，而是在：
- settings
- debug 面板
- command palette
中进入。

### 里面包含
1. Session list
2. Job list
3. Trace timeline
4. Bridge status
5. Key sync status
6. 最近错误

### 价值
这会成为：
- 你自己调试的核心工具
- 未来让“另外一个人实现”时最有帮助的自诊断系统

---

## 11. 白板 / 插件 / Workflow / Storyboard 联动语义

P6 应该明确所有运行来源：

### Canvas 发起
- source = `canvas`
- output 默认去 `canvas` 或 `history`

### Workflow 发起
- source = `workflow`
- output 默认去 `node output`
- 再由 output node 决定是否落画布/资产/shot

### Storyboard 发起
- source = `storyboard`
- output 默认回填 `shot`

### Plugin 发起
- source = `extension-*`
- output 可去 `canvas` / `prompt` / `history`

### 外部脚本/技能发起
- source = `external-client`
- output 由 `command.send` 指定

### 为什么一定要统一
因为后面一旦问题多起来，你必须知道：
- 这个结果是谁发起的
- 它本来应该去哪里
- 它实际上去了哪里

---

## 12. 推荐实施顺序

### Step 1：先做 `runtimeTraceStore`
统一 session/job/trace 数据结构。

### Step 2：Workflow 和生成链写 trace
- workflowEngine
- aiGateway
- useGeneration

### Step 3：扩展桥接写 trace
- background
- content
- runtime api

### Step 4：做 `BridgeStatusCard` 和 `KeySyncStatusCard`
让共享 key / bridge 状态可见。

### Step 5：做 `TracePanel`
让人可以真正看懂系统行为。

### Step 6：最后升级 runtime API
让脚本/技能也能读 trace。

---

## 13. 验证标准

P6 做完后，至少要能做到：

1. 任意一个生成任务都能查到 job record
2. Workflow 每个 node 都能看到运行 trace
3. 插件发起的命令能看到完整桥接路径
4. 用户能看到当前 API Key 是否和插件共享成功
5. 出错时能知道失败发生在哪一层
6. 外部脚本能通过 runtime API 查询 trace / bridge / key 状态

---

## 14. 风险点

### 风险 1：trace 太多，UI 变成日志堆
解决：
- 先结构化事件
- 再分级显示
- 不直接暴露原始 provider 噪音

### 风险 2：把观测层和业务层耦太死
解决：
- trace 通过 store append event
- 业务只发事件，不关心 UI

### 风险 3：用户误以为“有 bridge 就一定共享 key”
解决：
- 一定要区分：bridge 可用 ≠ key 已共享成功
- 用 `KeySyncStatusCard` 明确显示

---

## 15. 最后的建议

P6 对你这个项目非常关键，因为你已经不是在做一个单纯画布，而是在做：
- 白板
- 节点工作流
- 分镜系统
- 插件联动
- 外部 runtime API

这些东西没有 observability，后面一定会越来越难控。

所以 P6 的价值不是“给开发者看日志”，而是：

> **把系统从“能跑”升级成“可解释、可定位、可联动”。**

这一步做完，你的白板项目和插件联动才算真正进入平台阶段。

---

## 16. 推荐的下一个规划主题

如果你还要继续补完整平台路线，P7 最自然的是：

### P7：Claude / Agent / Skill Native Integration
重点做：
- 让 Claude Code / skill 调用白板 API 更稳定
- 任务与画布元素双向绑定
- 命令式 API 升级为画布动作 DSL
- 插件 / web / agent 三端统一会话语义

这会把你的产品进一步推向“AI 原生创作操作系统”。