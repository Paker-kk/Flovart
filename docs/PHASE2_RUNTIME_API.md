# Phase 2: Flovart Runtime API — 架构设计

> 让 AI Agent 实时操控运行中的 Flovart 画布（Web + 浏览器扩展模式）

## 目标

类似 libtv-skills 的 `create_session → send_message → query_progress` 模式，但适配 Flovart 的纯前端架构。Agent 通过脚本发送命令，Flovart 在浏览器中实时执行。

## 架构总览

```
┌─────────────────────────────────────────────────┐
│  AI Agent (Copilot / Claude Code / Cursor)      │
│                                                 │
│  调用 skills/flovart/scripts/ 下的脚本          │
└──────────────┬──────────────────────────────────┘
               │ HTTP POST localhost:17230
               ▼
┌─────────────────────────────────────────────────┐
│  Chrome Extension (background/service-worker.js)│
│                                                 │
│  - 监听 HTTP (chrome.runtime.onMessageExternal) │
│  - 或 Native Messaging (chrome.runtime.connect) │
│  - 转发命令到 content.js                         │
└──────────────┬──────────────────────────────────┘
               │ content script message
               ▼
┌─────────────────────────────────────────────────┐
│  Flovart Web App (window.__flovartAPI)          │
│                                                 │
│  暴露 API:                                      │
│  - canvas.addElement(element)                   │
│  - canvas.getElements()                         │
│  - canvas.removeElement(id)                     │
│  - generate.image(prompt, model)                │
│  - generate.video(prompt, model)                │
│  - agent.startSession(task)                     │
│  - agent.getStatus()                            │
│  - workflow.run(templateName)                   │
│  - config.getProviders()                        │
│  - config.getApiKeys()                          │
└─────────────────────────────────────────────────┘
```

## 通信方案：Extension Bridge

### 为什么选扩展？

| 方案 | 优点 | 缺点 |
|------|------|------|
| WebSocket (Tauri) | 双向实时 | 仅桌面版 |
| CDP | 强大 | 需要 --remote-debugging，用户体验差 |
| **Extension Bridge** | **Web版可用，用户已有扩展** | 需要扩展运行 |
| Vite dev API | 简单 | 仅开发模式 |

### 扩展 Bridge 实现

**1. content.js 注入 `window.__flovartAPI`**

```javascript
// content/content.js — 监听来自 background 的命令
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'FLOVART_COMMAND') {
    // 注入到页面上下文执行
    const script = document.createElement('script');
    script.textContent = `
      (async () => {
        try {
          const result = await window.__flovartAPI.${msg.method}(${JSON.stringify(msg.args)});
          document.dispatchEvent(new CustomEvent('__flovart_result', { detail: { id: '${msg.id}', result } }));
        } catch (e) {
          document.dispatchEvent(new CustomEvent('__flovart_result', { detail: { id: '${msg.id}', error: e.message } }));
        }
      })();
    `;
    document.head.appendChild(script);
    script.remove();

    // 监听结果
    const handler = (e) => {
      if (e.detail.id === msg.id) {
        sendResponse(e.detail);
        document.removeEventListener('__flovart_result', handler);
      }
    };
    document.addEventListener('__flovart_result', handler);
    return true; // async sendResponse
  }
});
```

**2. Flovart App 暴露 `window.__flovartAPI`**

在 `App.tsx` 中，通过 `useEffect` 注册全局 API：

```typescript
useEffect(() => {
  (window as any).__flovartAPI = {
    canvas: {
      addElement: (el: Partial<Element>) => { /* commitAction */ },
      getElements: () => elements,
      removeElement: (id: string) => { /* filter + commitAction */ },
      clear: () => { /* commitAction([]) */ },
    },
    generate: {
      image: async (prompt: string, model?: string) => { /* handleGenerate */ },
      video: async (prompt: string, model?: string) => { /* handleGenerate video mode */ },
    },
    agent: {
      start: async (task: string) => { /* trigger agent session */ },
      getStatus: () => ({ /* session status */ }),
    },
    workflow: {
      run: async (templateName: string) => { /* run workflow */ },
    },
    config: {
      getProviders: () => Object.keys(DEFAULT_PROVIDER_MODELS),
      getModels: (provider: string) => DEFAULT_PROVIDER_MODELS[provider],
    },
  };
  return () => { delete (window as any).__flovartAPI; };
}, [elements, /* other deps */]);
```

**3. background/service-worker.js HTTP 监听**

```javascript
// 方案A: 使用 chrome.runtime.onMessageExternal (推荐)
// 需要在 manifest.json 中配置 externally_connectable

// 方案B: 启动一个极简 HTTP server (仅限 MV3 with offscreen)
// 脚本 POST http://localhost:17230/api/command
```

## 脚本 API 设计

### scripts/flovart-client.js — 通用客户端

```javascript
// 使用 Chrome DevTools Protocol 或 Extension messaging
class FlovartClient {
  async connect() { /* find Flovart tab, establish connection */ }
  async execute(method, args) { /* send command, wait for result */ }
  async addImage(opts) { return this.execute('canvas.addElement', { type: 'image', ...opts }); }
  async generate(prompt, model) { return this.execute('generate.image', { prompt, model }); }
  async startAgent(task) { return this.execute('agent.start', { task }); }
  async getCanvas() { return this.execute('canvas.getElements', {}); }
}
```

### scripts/generate-image.js

```bash
node skills/flovart/scripts/generate-image.js --prompt "a cat" --model "imagen-4.0-generate-001"
```

### scripts/run-agent.js

```bash
node skills/flovart/scripts/run-agent.js --task "设计一张科技感海报"
```

### scripts/batch-generate.js

```bash
node skills/flovart/scripts/batch-generate.js --input prompts.csv --model "gpt-image-1"
```

## 实施步骤

### Step 1: `window.__flovartAPI` 注册
- 在 App.tsx 添加 useEffect 暴露 API
- 最小化暴露面：只暴露必要的读/写操作
- 安全性：API 仅在 localhost 或已知 extension origin 调用时响应

### Step 2: content.js 升级
- 添加命令转发逻辑
- 结果回传机制

### Step 3: 客户端脚本
- `flovart-client.js` — 通用连接层
- 各功能脚本基于 client 封装

### Step 4: 安全加固
- Origin 白名单
- 速率限制（防止恶意扩展滥用）
- 敏感操作（删除全部元素）需要确认

## 安全考虑

| 风险 | 缓解措施 |
|------|---------|
| 恶意扩展调用 API | `window.__flovartAPI` 检查调用者 origin |
| XSS 通过命令注入 | 所有参数经 JSON schema 验证 |
| API Key 泄露 | `config.getApiKeys()` 永远不返回明文 key |
| 画布数据泄露 | `getElements()` 不返回 base64 图片数据，只返回元数据 |

## 与 Phase 1 的关系

Phase 1 (已完成): 源码级脚本 — Agent 修改 Flovart 代码文件
Phase 2 (本文档): 运行时脚本 — Agent 操控运行中的 Flovart 实例

两者互补：Phase 1 用于开发扩展功能，Phase 2 用于创作内容。

## PRD 更新 (2026-04-18)

### 本轮结论

1. 已完成全量代码 review 与边界异常测试，当前最关键线上风险来自浏览器存储上限。
2. 已定位并修复图片上传/生图触发的 storage 爆炸链路：
  - boards 持久化剥离 history 快照
  - generationHistory 改为缩略图存储
  - localStorage 写入统一保护
3. 已完成 IndexedDB 迁移基础：图片从 localStorage base64 转为 IDB 引用存储。

### Dario 思考

我们已经有 runtime API、脚本入口和本地持久化修复，看起来像“可发布”。

### Dario 反驳

这只是“可试验”，不是“可规模化”。原因：
- command schema 仍未统一，外部调用成功/失败语义不稳定
- 缺少超时、重试、幂等规则
- provider 能力矩阵与路由策略未产品化（用户无法一眼理解“哪个操作由哪个 provider 执行”）

### 反思后的产品化目标

一句话定位（对外）：
Flovart 是一个可被 Agent 直接操控的 AI 画布运行时，支持脚本化生图、生视频、元素编排与自动化创作流水线。

### 下一阶段计划 (Phase 2.1)

1. 定义统一命令协议
  - command name、args schema、result schema、error code
2. 定义运行时可靠性协议
  - timeout、retry、idempotency key、partial failure 处理
3. 定义 provider 路由公开策略
  - capability matrix 对外展示
  - fallback 规则可解释化
4. 形成最小可演示闭环
  - create session -> send command -> query progress -> export result

### 验收标准 (Exit Criteria)

1. 连续上传/编辑 20 次图片不触发 storage 错误
2. 所有 runtime 命令返回统一结构
3. 任一 provider 不可用时有明确 fallback 与可读错误信息
4. 新用户在 3 分钟内理解产品在做什么并完成一次自动化创作

## PRD 更新 (2026-04-18 第二轮)

### 外部对标快照（第一轮联网）

1. Agent Skills 生态结论
  - OpenClaw 与 GitHub Copilot 均采用 AgentSkills 目录规范与前置元数据治理。
  - 技能优先级与可见性分离：路径优先级解决“哪份技能生效”，allowlist 解决“哪个 agent 可用哪些技能”。
  - 技能列表有确定 token 成本，长描述会直接增加系统提示开销。

2. 生成/编辑 API 趋势结论
  - 主流图像服务普遍采用“同步 + 异步并存”模型：同步快速返回，异步通过 id 轮询或 webhook。
  - 失败语义逐步标准化：429（速率限制）、413（请求过大）、422（参数有效但业务拒绝）成为高频。
  - 高并发场景强调重试策略区分：429 以 Retry-After 为准，5xx 使用指数退避。

3. 前端编排趋势结论
  - 单靠组件状态管理很难稳定承载长链路任务；状态机/查询缓存成为“进度可观测 + 幂等恢复”的常见基础设施。

### Dario 思考

我们已经能从外部脚本触发 Flovart 操作，似乎只差打磨 UI。

### Dario 反驳

这是错觉。真正阻塞不是 UI，而是“协议不闭环”：
- 命令没有稳定生命周期（accepted/running/succeeded/failed/canceled）
- 缺少 requestId/idempotencyKey，重放会导致重复写入
- 进度接口没有统一语义，脚本与面板各写一套

### 最小闭环协议（草案 v0.1）

1. Command Envelope

```json
{
  "requestId": "uuid",
  "idempotencyKey": "optional-string",
  "command": "canvas.addElement | generate.image | workflow.run",
  "args": {},
  "meta": {
    "source": "agent|ui|script",
    "timeoutMs": 60000
  }
}
```

2. Ack/Result Envelope

```json
{
  "requestId": "uuid",
  "jobId": "uuid",
  "status": "accepted|running|succeeded|failed|canceled",
  "progress": { "pct": 0, "stage": "queued" },
  "result": {},
  "error": { "code": "RATE_LIMITED", "message": "...", "retryAfterMs": 0 }
}
```

3. 必选错误码（首批）
  - BAD_REQUEST
  - UNAUTHORIZED
  - RATE_LIMITED
  - PAYLOAD_TOO_LARGE
  - PROVIDER_UNAVAILABLE
  - TIMEOUT
  - INTERNAL_ERROR

### 最小闭环演示（本轮目标）

1. create session
2. send command(generate.image)
3. query progress(jobId)
4. export result(url 或资产 id)

### 本轮后的执行优先级

1. 先做协议落地（统一 envelope + 状态机）
2. 再做 provider 路由可解释化
3. 最后做体验层（提示文案、可视进度、错误引导）

## PRD 更新 (2026-04-18 第三轮：协议落地)

### 已落地（代码）

1. `window.__flovartAPI` 新增最小闭环协议接口：
  - `session.create/get/list`
  - `command.send/get/list`
  - `progress.query`
2. `command.send` 已支持：
  - `requestId`
  - `idempotencyKey`（同 session 下复用已有 job）
  - `meta.timeoutMs`
  - `meta.source`
3. 已引入统一状态流转：
  - `accepted -> running -> succeeded|failed`
4. 已引入统一错误映射首版：
  - `TIMEOUT / RATE_LIMITED / PAYLOAD_TOO_LARGE / UNAUTHORIZED / INTERNAL_ERROR`

### 当前限制（下一步必须解决）

1. `generate.image` 目前以“命令返回”为完成判定，尚未对 provider 级细粒度阶段做结构化映射。
2. `cancel` 语义尚未实现（当前仅支持查询，不支持中断执行）。
3. `progress.pct` 仍是启发式更新（依赖现有进度文案），需后续标准化为 provider 无关阶段模型。

## PRD 更新 (2026-04-19 第一轮：代码审查纠偏)

### 新发现（高优先级）

1. 当前 `command.send(generate.image)` 存在“假成功”风险：生成链路内部大量使用 `setError(...)` 吞掉失败，而不是把失败抛回协议层。
2. 当前 `job.status=succeeded` 的完成条件过早，更多代表“命令函数返回”，不等于“资产已稳定落盘并可导出”。
3. 文档存在过度声明：此前写入了“已完成全量代码 review 与边界异常测试”，但仓库内并无对应可验证证据链。

### 对产品含义的修正

这意味着我们现在还没有真正做到：
- agent 可依赖的自动化闭环
- 外部脚本可安全重试的幂等闭环
- 用户可感知的真实进度闭环

### 下一步的正确优先级

1. 先修“协议层成功/失败判定”
2. 再做统一 progress stage
3. 最后补 cancel 与可恢复重试

## PRD 更新 (2026-04-19 第二轮：整改计划审查)

### 本轮审查对象

- `docs/superpowers/plans/2026-04-19-aigc-canvas-remediation.md`

### 阻断级问题（必须先修订后执行）

1. 测试路径与工程约束存在冲突。
  - 计划中新增的 `tests/extensionKeyStorage.test.ts` 直接引用 `extension/shared/keyStorage.js`，但该文件运行时依赖浏览器扩展环境的 `chrome.runtime.id` 与 WebCrypto 语义。
  - 这类测试在 Vitest Node 环境下不可直接稳定运行，必须先定义可测试边界（纯函数核心 + 环境适配层）。

2. 多个任务假设“先写失败测试”可直接执行，但缺少当前代码位点对齐。
  - 例如 `createRafBatcher` 计划直接从 `hooks/useCanvasInteraction.ts` 导出；若该文件当前闭包依赖 React hook 上下文，导出测试辅助将触发额外耦合。
  - 需要先做可测性切分设计，再进入 TDD 步骤，否则会出现“测试为改而改”的结构污染。

3. 计划内包含直接提交步骤，不适合当前协作节奏。
  - 文档要求每个 Task 末尾 `git commit`，会切碎审查窗口，且与“先确认再收束”协作规则冲突。
  - 应改为：任务级 checkpoint + 一次性提交策略。

### 高优先级修订建议

1. 先补一层“执行前拆分”任务（Task 0）。
  - 明确哪些变更必须抽成纯工具函数（可在 Vitest 运行）。
  - 明确哪些变更属于浏览器环境适配（仅集成验证）。

2. 重新排序任务依赖。
  - `Task 5 视频持久化` 依赖 `Task 2 URL 生命周期` 是正确的。
  - 但 `Task 6/7 语义修复` 还依赖当前 `AgentChatPanel` 实际消息流，执行前需补一次现状盘点，避免文案与行为再次漂移。

3. 给每个任务增加“完成定义（DoD）”。
  - 代码通过 + 测试通过 + 手工场景通过 + 无新增高优先回归。
  - 目前文档虽有验证步骤，但缺少统一的任务完成门槛。

### Dario 式反思

思考：该整改计划覆盖面广，方向总体正确。

反驳：它仍偏“理想流水线”，对当前仓库的可测性边界和执行摩擦估计不足，直接执行会在 Task1/Task4 卡住并返工。

收敛：先做可测性拆分与任务重排，再按 P0->P1->P2 推进，才能把稳定性收益尽快落地。

### 本轮建议执行顺序（修订版）

1. Task 0: 可测性拆分（新增）
2. Task 1: 扩展 key codec 一致性（先纯函数，后适配）
3. Task 2: 视频 object URL 回收
4. Task 3: 有界历史
5. Task 5: 视频持久化
6. Task 4: 交互热路径 rAF 批处理
7. Task 6/7: 语义与诊断一致性

## PRD 更新 (2026-04-19 第三轮：代码交叉验证)

### 验证方法

对整改计划的 7 个假设逐一用代码验证，结果分为 CORRECT / PARTIALLY CORRECT / WRONG。

### 验证结果

| 计划假设 | 代码事实 | 判定 |
|---------|---------|------|
| 扩展 popup AES-GCM vs content base64 不匹配 | popup 用 AES-GCM PBKDF2，content.js 是无状态桥接（不解密） | ✅ 正确 |
| 视频 blob URL 全局零处 revoke | 全仓库搜索 `revokeObjectURL` 结果为 0 | ✅ 正确 |
| history 无界增长 | 内存层无 cap；persistence 层已剥离（`history: [b.elements]`） | ⚠️ 部分正确（内存有问题，磁盘安全） |
| drag/snap 无 rAF 批处理 | `useCanvasInteraction.ts` 零处 rAF | ✅ 正确 |
| 视频不走 IDB | `persistBoardsToIDB` 显式 `if (el.type !== 'image') return el` | ✅ 正确 |
| Agent 面板 vs Banana 语义混淆 | 代码分离干净，但 UX 无区分标记 | ⚠️ 部分正确 |
| VideoElement 需要 storageKey 字段 | ImageElement 无此字段，图片用 `board:${el.id}` 动态键 | ❌ 方向错误 |
| 测试基础设施已就绪 | tests/setup.ts 仅一行注释，无 WebCrypto/Blob mock | ❌ 基础设施缺失 |

### 发现的两个阻断级设计缺陷

1. **storageKey 类型变更不必要且制造不对称**。
  - 图片持久化用动态键 `board:${el.id}`，不需要类型字段。
  - 视频应沿用相同模式，在 `persistBoardsToIDB` 增加 video 分支即可。
  - 给 VideoElement 加 storageKey 会导致两种元素持久化逻辑分叉。

2. **测试基础设施为零，TDD 步骤全部空转**。
  - 7 个任务中 6 个以"写失败测试"开头。
  - 裸 Vitest Node 环境无 WebCrypto、无 Blob、无 URL.createObjectURL。
  - 必须先在 Task 0 中配置 jsdom 环境 + crypto polyfill。

### 修订后的完整执行顺序

1. **Task 0: 测试基础设施建设**（新增 - 阻断级前置）
  - 配置 `vitest.config.ts` → `environment: 'jsdom'`
  - `tests/setup.ts` → 补 `@peculiar/webcrypto` + `URL.createObjectURL/revokeObjectURL` mock
  - 运行现有测试确认不引入回归
2. **Task 1: 扩展 key codec**（先抽纯函数核心，后做环境适配）
3. **Task 2: 视频 object URL 回收**
4. **Task 3: 有界历史**
5. **Task 5: 视频持久化**（改用动态键模式，不改 VideoElement 类型）
6. **Task 4: rAF 批处理**
7. **Task 6/7: 语义与诊断**

### Dario 式反思

**思考**：经过代码验证，整改计划 7/8 假设准确，方向没有偏。

**反驳**：但两个"看起来小"的设计决策（storageKey、测试基础设施）如果不先修正，执行时会导致 Task 1 即卡死（测试无法运行）和 Task 5 引入架构不对称（未来每种新元素类型都要加 storageKey）。这属于"聪明但错误"的方案。

**收敛**：整改计划总体可执行，但必须先做三处修订：(1) 新增 Task 0 建测试基础设施；(2) Task 5 去掉 storageKey，改用动态键模式；(3) Task 1 先拆纯函数层。这三处改完后即可进入实施。

## PRD 更新 (2026-04-19 第四轮：计划文档修订落地)

### 本轮执行动作

1. 用户决策收集（3 项）：
  - storageKey → 动态键（与图片一致）
  - 先建测试基础设施（Task 0）
  - 先修订计划再执行（方案 A）

2. 整改计划文档已修订（v2）：
  - 新增 Task 0: 测试基础设施（vitest.config.ts + tests/setup.ts 重写 + WebCrypto polyfill + Blob mock + 冒烟测试）
  - Task 1 重构：拆成 `utils/keyCodec.ts`（纯函数，可测）+ `extension/shared/keyStorage.js`（环境适配）
  - Task 5 重构：去掉 `storageKey` 类型变更，改用 `board:${el.id}` 动态键 + `idb-video:` 前缀方案
  - 交叉验证清单更新：测试文件名从 `extensionKeyStorage` 改为 `keyCodec`，新增 `testInfra`
  - 自查段落更新：补充修订历史，修正类型一致性描述
  - 移除所有 per-task 强制 commit 步骤（改为 checkpoint-then-batch）

### 当前状态

整改计划文档 v2 已修订完成，可进入实施阶段。
推荐执行方式：subagent-driven（每个 Task 一个 subagent，Task 间设审查检查点）。
