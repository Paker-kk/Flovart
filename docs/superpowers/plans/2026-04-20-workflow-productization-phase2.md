# Workflow Productization Phase 2 Plan

> 目标：在 Phase 1 顶栏 + App Shell + 页内切换完成后，把现有节点流从“可运行原型”升级为“正式产品工作区”，重点解决节点配置、执行状态、结果预览、参数传递与产品信息架构问题。
>
> 本阶段只做规划，不写代码。

---

## 0. 结论

你现在的 Workflow 不是从零开始，而是已经有一个 **70% 的底座**：

- 有节点 store：[components/nodeflow/useNodeWorkflowStore.ts](components/nodeflow/useNodeWorkflowStore.ts)
- 有节点定义：[components/nodeflow/defs.ts](components/nodeflow/defs.ts)
- 有执行引擎：[services/workflowEngine.ts](services/workflowEngine.ts)
- 有节点 UI：[components/NodeWorkflowPanel.tsx](components/NodeWorkflowPanel.tsx)

但现在它的问题也很明确：

1. **像一个“编辑器 demo”**，不像一个产品级 workflow studio
2. **节点配置不完整**，很多 provider/model/params 只能在代码里兜底
3. **执行态不够可视化**，用户不容易理解当前运行到了哪一步
4. **结果输出没有形成稳定产品语义**，例如 image/video/text 输出不够统一
5. **NodeWorkflowPanel 还混合了 editor、toolbar、context menu、run flow、状态文本**，后续会越来越难扩展

所以 P2 的正确目标不是“继续加几个节点”，而是：

> 把 Workflow 从“一个节点画布组件”升级成“正式的多 provider AI 工作流工作区”。

---

## 1. P2 的目标边界

本阶段完成后，Workflow 视图应该具备：

1. 左侧有 **Node Library / Template Library**
2. 中间是 **Node Canvas**
3. 右侧有 **Node Inspector**
4. 每个节点可以配置：
   - provider
   - model
   - 参数
   - timeout / retry
   - API key 来源
5. 执行时每个节点都有状态：
   - idle
   - queued
   - running
   - success
   - error
6. 执行结果可以被预览、追踪、落到画布/资产区
7. 节点之间的数据传递规则清晰统一

### 本阶段仍然不做
- 完整 Storyboard 编辑器
- 完整视频时间线编辑器
- 节点动画系统的最终精修
- 多人协作

---

## 2. 现有代码状态诊断

## 2.1 store 已经足够强
当前 [components/nodeflow/useNodeWorkflowStore.ts](components/nodeflow/useNodeWorkflowStore.ts) 已经支持：
- 节点增删改
- group
- clipboard
- undo/redo
- viewport
- selection
- localStorage persistence

关键点：
- `STORAGE_KEY = 'flovart.nodeflow.v1'`，见 [components/nodeflow/useNodeWorkflowStore.ts:57](components/nodeflow/useNodeWorkflowStore.ts#L57)
- `HISTORY_LIMIT = 80`，见 [components/nodeflow/useNodeWorkflowStore.ts:58](components/nodeflow/useNodeWorkflowStore.ts#L58)
- `commitGraph()` 已经是一个比较好的写入口，见 [components/nodeflow/useNodeWorkflowStore.ts:143-152](components/nodeflow/useNodeWorkflowStore.ts#L143-L152)

### 说明
Store 层不需要重写，只需要继续产品化抽象。

---

## 2.2 defs 已经有丰富节点雏形
当前 [components/nodeflow/defs.ts](components/nodeflow/defs.ts) 已经定义了：
- `llm`
- `imageGen`
- `videoGen`
- `runningHub`
- `httpRequest`
- `condition`
- `merge`
- `template`
- `saveToCanvas`

说明：
- 节点种类已经比 UI 上真正暴露出来的更多
- 现在缺的是“产品化入口”和“配置界面”，不是缺节点类型

---

## 2.3 执行引擎已经具备核心路由能力
[services/workflowEngine.ts](services/workflowEngine.ts) 已经支持：
- topo sort
- 顺序执行
- provider 选 key
- LLM/image/video/runningHub/http 节点

关键点：
- `topologicalSort()` 已经有了，见 [services/workflowEngine.ts:47-87](services/workflowEngine.ts#L47-L87)
- `executeLLM()`、`executeImageGen()`、`executeVideoGen()`、`executeRunningHub()`、`executeHttpRequest()` 都已经有实现
- `ExecutionContext` 已经支持进度回调、错误回调、完成回调，见 [services/workflowEngine.ts:18-35](services/workflowEngine.ts#L18-L35)

### 真正问题
不是“不能跑”，而是：
- 输出类型太松：`PortValue = string | null`，见 [services/workflowEngine.ts:12](services/workflowEngine.ts#L12)
- 这会导致 image / video / text / json 混在一起，不利于后续 inspector 和 preview 产品化

---

## 2.4 NodeWorkflowPanel 现在太大、职责太杂
[components/NodeWorkflowPanel.tsx](components/NodeWorkflowPanel.tsx) 现在同时负责：
- toolbar
- context menu
- editor canvas
- minimap
- keyboard shortcuts
- run 流程
- status 文本
- attachment drop

尤其是：
- `runGraph()` 里还有应用级流程判断，见 [components/NodeWorkflowPanel.tsx:137-191](components/NodeWorkflowPanel.tsx#L137-L191)
- 顶部 toolbar 直接硬编码在组件里，见 [components/NodeWorkflowPanel.tsx:414-479](components/NodeWorkflowPanel.tsx#L414-L479)

### 结论
P2 必须把它拆成多个职责组件，否则很快继续长成第二个 App.tsx。

---

## 3. P2 的目标信息架构

建议把 Workflow workspace 拆成三栏：

```text
┌──────────────────────────────────────────────────────────────┐
│ Workflow Header                                             │
├───────────────┬──────────────────────────────┬───────────────┤
│ Node Library  │ Node Canvas                  │ Node Inspector│
│ / Templates   │ (editor + edges + minimap)   │ / Run Details │
└───────────────┴──────────────────────────────┴───────────────┘
```

### 左栏：Node Library / Templates
负责：
- 添加节点
- 搜索节点
- 插入模板
- provider preset

### 中栏：Node Canvas
负责：
- 编辑图
- 连接线
- selection
- drag/group
- minimap

### 右栏：Node Inspector / Run Details
负责：
- 当前节点配置
- provider/model/params
- 节点输入输出预览
- 运行日志/错误

---

## 4. P2 推荐文件结构

### 新增文件

```text
components/workflow/
  WorkflowHeader.tsx
  WorkflowCanvas.tsx
  WorkflowSidebar.tsx
  WorkflowInspector.tsx
  WorkflowStatusPanel.tsx
  WorkflowTemplatePicker.tsx
  WorkflowRunBadge.tsx

components/nodeflow/
  NodeLibrary.tsx
  NodeInspector.tsx
  NodeConfigFields.tsx
  NodeOutputPreview.tsx
  NodeCard.tsx
  EdgeLayer.tsx
  Minimap.tsx

services/
  workflowRuntime.ts
```

### 修改文件

```text
components/NodeWorkflowPanel.tsx
components/nodeflow/types.ts
components/nodeflow/defs.ts
components/nodeflow/useNodeWorkflowStore.ts
services/workflowEngine.ts
App.tsx
```

---

## 5. 类型系统升级方案

这是 P2 最关键的一步。

## 5.1 当前问题
现在 [services/workflowEngine.ts:12](services/workflowEngine.ts#L12) 用的是：

```ts
export type PortValue = string | null;
```

这会让：
- text
- image dataUrl
- video object URL
- json string
全部都塞成一个 string

### 后果
- Inspector 很难知道自己现在拿到的是啥
- Preview 只能靠猜
- saveToCanvas / saveToAssets 很难做干净
- videoEdit / storyboard 后续会很痛苦

---

## 5.2 建议改成结构化输出
建议新增统一类型：

```ts
export type WorkflowValue =
  | { kind: 'text'; value: string }
  | { kind: 'image'; value: string; mimeType?: string }
  | { kind: 'video'; value: string; mimeType?: string; storageKey?: string }
  | { kind: 'json'; value: unknown }
  | { kind: 'empty' };

export interface NodeIOMap {
  [portKey: string]: WorkflowValue;
}
```

### 为什么必须做
因为：
- Inspector 才能稳定预览
- NodeOutputPreview 才能稳定渲染
- saveToCanvas 节点才知道落成 image 还是 video
- 后续 videoEdit 节点才能拿到真正的视频语义

---

## 5.3 节点配置类型统一
建议在 [components/nodeflow/types.ts](components/nodeflow/types.ts) 新增或收口：

```ts
export interface NodeRuntimeConfig {
  provider?: string;
  model?: string;
  apiKeyRef?: string;

  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  retryCount?: number;

  systemPrompt?: string;
  promptTemplate?: string;

  httpUrl?: string;
  httpMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  httpHeaders?: string;
  httpBodyTemplate?: string;
  httpResultPath?: string;

  rhEndpoint?: string;
  rhResolution?: string;
  rhAspectRatio?: string;

  params?: Record<string, unknown>;
}
```

然后所有 node：

```ts
config?: NodeRuntimeConfig;
```

### 作用
把 provider/model/http/runningHub 这些字段收口，不再越扩越散。

---

## 6. Node Inspector 规划

## 6.1 新增 [components/nodeflow/NodeInspector.tsx](components/nodeflow/NodeInspector.tsx)
职责：
- 显示当前选中节点信息
- 配置 provider/model/params
- 显示输入/输出 preview
- 显示错误信息

### 面板内容建议

#### 区块 1：Basic
- 节点名
- 节点类型
- provider
- model

#### 区块 2：Parameters
- temperature
- maxTokens
- timeoutMs
- retryCount
- provider-specific params

#### 区块 3：Bindings
- 每个输入端口的绑定来源
- 当前端口值摘要

#### 区块 4：Output Preview
- text preview
- image thumbnail
- video poster / playable preview
- json tree

---

## 6.2 参数交互原则
不要做成机械后台表单，建议：
- 常用参数直出
- 高级参数折叠
- 参数支持“固定值 / 绑定变量”切换
- provider 切换时，展示该 provider 支持的字段

---

## 7. WorkflowHeader 规划

新增 [components/workflow/WorkflowHeader.tsx](components/workflow/WorkflowHeader.tsx)

职责：
- 显示当前 workflow 名称
- Run / Stop / Save / Template 按钮
- 当前运行状态摘要
- 当前选中 provider summary

### 为什么要独立
现在 toolbar 直接写在 [NodeWorkflowPanel.tsx:414-479](components/NodeWorkflowPanel.tsx#L414-L479)，后续扩展会越来越乱。

---

## 8. WorkflowSidebar / NodeLibrary 规划

新增：
- [components/workflow/WorkflowSidebar.tsx](components/workflow/WorkflowSidebar.tsx)
- [components/nodeflow/NodeLibrary.tsx](components/nodeflow/NodeLibrary.tsx)
- [components/workflow/WorkflowTemplatePicker.tsx](components/workflow/WorkflowTemplatePicker.tsx)

职责：
- 展示可插入节点
- 分类：Prompt / Gen / Video / Integrations / Logic / Output
- 搜索节点
- 插入模板

### 节点分类建议

#### Prompt & Logic
- prompt
- enhancer
- llm
- template
- condition
- merge

#### Media Input
- loadImage
- （后续加）loadVideo
- assetInput

#### Generation
- imageGen
- videoGen
- （后续）videoEdit

#### Integrations
- runningHub
- httpRequest

#### Output
- preview
- saveToCanvas
- （后续）saveToAssets

---

## 9. 执行状态产品化方案

## 9.1 每个节点增加运行状态
建议新增：

```ts
export type NodeRunStatus = 'idle' | 'queued' | 'running' | 'success' | 'error';
```

然后 store 中维护：

```ts
nodeRuntimeState: Record<string, {
  status: NodeRunStatus;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
}>;
```

### 为什么放 store
因为 NodeCanvas、Inspector、Header 都要读它。

---

## 9.2 运行时状态来源
你已经有：
- `onProgress`
- `onNodeComplete`
- `onError`

见 [services/workflowEngine.ts:27-32](services/workflowEngine.ts#L27-L32)

所以不用重写执行模型，只需要：
- workflowEngine 调回调
- store 吃回调
- UI 订阅 store

---

## 9.3 运行可视化
建议表现：
- running：节点边框高亮、右上角状态点 pulsing
- success：节点右上角绿色 badge
- error：节点右上角红色 badge + inspector 显示错误
- active edge：执行中边加发光

### 注意
P2 先做最轻量的状态反馈，不要一上来就把动画做爆。

---

## 10. Workflow 执行结果落地策略

现在 `executeVideoGen()` 会直接创建 `blob:` URL，见 [services/workflowEngine.ts:244-257](services/workflowEngine.ts#L244-L257)

### 问题
这对产品级 workflow 不够稳，因为：
- output 没统一进入资产系统
- 结果没有稳定 storage 语义
- reload 后会断

### P2 方案
所有 workflow 输出遵守：

1. **先进入 node output state**
2. **再由 output node 决定是否落画布 / 落资产 / 落 storyboard**

也就是说，不要在执行器里直接决定最终产品落点。

### 具体建议
- `preview` 节点：只负责展示 output
- `saveToCanvas` 节点：把结构化 output 落画布
- 后续 `saveToAssets` 节点：把结构化 output 落资产区

---

## 11. App 集成方式（P2）

在 Phase 1 的 [components/workspaces/WorkflowWorkspace.tsx](components/workspaces/WorkflowWorkspace.tsx) 基础上，P2 应该升级为：

```tsx
<WorkflowWorkspace
  header={<WorkflowHeader ... />}
  sidebar={<WorkflowSidebar ... />}
  canvas={<WorkflowCanvas ... />}
  inspector={<WorkflowInspector ... />}
/>
```

### 这样做的好处
- Workflow 不再只是一个大组件
- 每块可以独立迭代
- 后续你加 Storyboard / VideoEdit 也能复用这些产品层模式

---

## 12. 文件级实施顺序

### Step 1：类型升级
改：
- [components/nodeflow/types.ts](components/nodeflow/types.ts)
- [services/workflowEngine.ts](services/workflowEngine.ts)

目标：
- 引入 `WorkflowValue`
- 引入 `NodeRuntimeConfig`
- 引入 `NodeRunStatus`

### Step 2：拆出 Workflow 结构层
新增：
- `WorkflowHeader.tsx`
- `WorkflowSidebar.tsx`
- `WorkflowInspector.tsx`
- `WorkflowCanvas.tsx`

目标：
- 把 `NodeWorkflowPanel` 外围壳层拆掉

### Step 3：Node Inspector 落地
新增：
- `NodeInspector.tsx`
- `NodeConfigFields.tsx`
- `NodeOutputPreview.tsx`

目标：
- 让节点真正可配置，而不是主要靠默认值运行

### Step 4：运行状态接入 store
改：
- [components/nodeflow/useNodeWorkflowStore.ts](components/nodeflow/useNodeWorkflowStore.ts)
- [services/workflowEngine.ts](services/workflowEngine.ts)

目标：
- 让 UI 知道“哪个节点正在跑 / 哪个节点失败了” 

### Step 5：节点库与模板入口
新增：
- `NodeLibrary.tsx`
- `WorkflowTemplatePicker.tsx`

目标：
- 从“右键加节点”升级为“产品级插入体验”

---

## 13. 建议新增的节点类型（P2 尾声，不一定同批）

### 必加
- `loadVideo`
- `videoEdit`
- `saveToAssets`

### 说明
这是为了后面承接：
- 视频编辑
- Storyboard
- 视频资产回流

如果没有这些节点，Workflow 最后还是偏图片工具。

---

## 14. 验证标准

P2 做完后，至少要能达到：

1. Workflow 视图看起来像独立工作区，不像临时 demo
2. 用户可以通过左侧库添加节点
3. 选中节点后，右侧 Inspector 能修改 provider/model/params
4. 运行一个 workflow 时，中间图上的节点状态会变化
5. 某个节点失败时，用户知道失败在哪里，而不是只看到全局报错
6. 输出能清楚地区分 text/image/video/json

---

## 15. 风险点

### 风险 1：NodeWorkflowPanel 拆分时行为回归
因为它现在职责太多，拆的时候最容易让：
- context menu
- keyboard shortcuts
- minimap
- active node
这些功能出问题。

### 风险 2：类型升级会牵动很多地方
从 `string | null` 升级到结构化 `WorkflowValue`，会触及：
- engine
- preview
- inspector
- saveToCanvas

但这一步非常值得做，否则后面所有视频/资产/storyboard 都会继续痛苦。

### 风险 3：Workflow 和主画布状态边界不清
建议明确约定：
- Workflow 输出不能隐式落画布
- 必须通过 output 节点或显式 action 落地

这样产品行为才可预测。

---

## 16. 我的建议（最重要）

P2 最容易犯的错误是：
> 一边想做产品化，一边又继续往 NodeWorkflowPanel 里塞功能。

我建议你强制遵守一条：

> **NodeWorkflowPanel 只保留“编辑器画布层”职责，不再继续承接产品壳层职责。**

也就是说，从 P2 开始你要把它从：
- 工作台
- toolbar
- 状态区
- inspector
- 运行面板

里面解放出来。

否则它会变成 Workflow 版本的 `App.tsx`。

---

## 17. P2-B 执行引擎升级：条件分支 + 自动后处理管线

> 用户选定方向：在 P2 UI 产品化的同时，优先增强执行引擎能力。
> 对标：ComfyUI (条件/循环/批量) + n8n (IF/Switch/Loop/Retry)

### 17.1 竞品调研摘要 (2026-04-21)

| 引擎 | ⭐ | 版本 | 条件 | 循环 | 批量 | 后处理 | 重试 |
|---|---|---|---|---|---|---|---|
| ComfyUI | 109k | v0.19.3 | ✅ Control Flow | ✅ repeat/latent batch | ✅ batch size | ✅ 内置 upscale/face | ❌ 手动 |
| Dify | 138k | v1.13.3 | ✅ IF/ELSE multi-branch | ✅ iteration node | ✅ array input | ❌ | ✅ retry |
| n8n | 185k | v2.17 | ✅ IF/Switch/Filter | ✅ Loop Over Items | ✅ 分批 SplitInBatches | ❌ | ✅ 内置 |
| Flowise | 52k | v3.1.2 | ✅ Condition Agent | ❌ | ❌ | ❌ | ❌ |
| **Flovart (现状)** | — | — | ✅ 简单 (contains/empty/length>) | ❌ | ❌ | ❌ | ❌ |

### 17.2 新增节点类型

#### A. 高级条件分支 (condition 升级)
```ts
// 现有: 只支持 contains/empty/length>
// 升级为: 正则、数值比较、JSON path、多条件 AND/OR
export interface ConditionRule {
  field: 'input' | 'text' | 'image' | string; // port key
  operator: 'contains' | 'not_contains' | 'equals' | 'not_equals' 
           | 'regex' | 'gt' | 'lt' | 'gte' | 'lte' | 'empty' | 'not_empty'
           | 'json_path_truthy';
  value: string;
  logicGroup?: 'and' | 'or'; // multi-condition
}
```

#### B. Switch 节点 (n8n 启发)
```ts
switch: {
  title: '多路分支 Switch',
  inputs: [{ key: 'input', type: 'any', label: 'INPUT' }],
  outputs: [
    { key: 'case1', type: 'any', label: 'Case 1' },
    { key: 'case2', type: 'any', label: 'Case 2' },
    { key: 'case3', type: 'any', label: 'Case 3' },
    { key: 'default', type: 'any', label: 'Default' },
  ],
}
```

#### C. 循环/迭代节点 (Dify iteration 启发)
```ts
iteration: {
  title: '迭代循环',
  inputs: [
    { key: 'array', type: 'any', label: 'ARRAY (JSON)' },
    { key: 'template', type: 'text', label: 'ITEM TEMPLATE' },
  ],
  outputs: [
    { key: 'item', type: 'any', label: 'CURRENT ITEM' },
    { key: 'results', type: 'any', label: 'ALL RESULTS' },
  ],
}
```

执行语义：
- 输入: JSON array
- 对每个 item，展开执行下游子图
- 汇总所有 item 的输出到 `results` port
- 支持 `maxIterations` 和 `concurrency` 配置

#### D. 后处理管线节点

```ts
upscale: {
  title: '超分辨率 Upscale',
  inputs: [{ key: 'image', type: 'image', label: 'IMAGE' }],
  outputs: [{ key: 'image', type: 'image', label: 'UPSCALED' }],
  // config: provider (RunningHub/local ESRGAN), scaleFactor (2x/4x)
}

faceRestore: {
  title: '人脸修复',
  inputs: [{ key: 'image', type: 'image', label: 'IMAGE' }],
  outputs: [{ key: 'image', type: 'image', label: 'RESTORED' }],
  // config: provider (RunningHub/CodeFormer/GFPGAN)
}

bgRemove: {
  title: '背景移除',
  inputs: [{ key: 'image', type: 'image', label: 'IMAGE' }],
  outputs: [
    { key: 'image', type: 'image', label: 'CUTOUT' },
    { key: 'mask', type: 'image', label: 'MASK' },
  ],
  // config: provider (RunningHub/rembg)
}

styleTransfer: {
  title: '风格迁移',
  inputs: [
    { key: 'image', type: 'image', label: 'CONTENT' },
    { key: 'style', type: 'image', label: 'STYLE REF' },
  ],
  outputs: [{ key: 'image', type: 'image', label: 'STYLED' }],
  // config: provider, strength (0-1)
}
```

#### E. 批量输入节点

```ts
batchInput: {
  title: '批量输入',
  inputs: [],
  outputs: [{ key: 'array', type: 'any', label: 'ITEMS' }],
  // config: source ('prompts_list' | 'images_folder' | 'csv')
}
```

### 17.3 执行引擎升级

#### 重试机制
```ts
// 在 ExecutionContext 中新增:
retryPolicy?: {
  maxRetries: number;      // default 2
  backoffMs: number;       // default 2000
  backoffMultiplier: number; // default 2 (exponential)
};
```

当节点执行失败时:
1. 检查 node.config.retryCount ?? ctx.retryPolicy.maxRetries
2. 等待 backoffMs * backoffMultiplier^attempt
3. 重新执行该节点
4. 超过重试次数才标记为 error

#### 条件分支选择执行
现在执行引擎是**顺序执行全部排序后的节点**。条件分支的 `null` 输出传递到下游，但下游仍然被执行（只是拿到空输入）。

升级为**跳过不可达路径**：
```ts
// 在 executeWorkflow 中:
// 如果上游是 condition/switch 节点，且该路径的输出为 null，
// 则标记该路径下游所有节点为 'skipped'，不执行
```

#### 并行执行独立分支
当拓扑排序后发现多个节点的入度同时为 0（无依赖关系），使用 Promise.allSettled 并行执行：
```ts
// 分层执行: 同一层级（无互相依赖）的节点并行运行
const layers = topologicalLayers(nodes, edges); // 分层拓扑
for (const layer of layers) {
  await Promise.allSettled(layer.map(node => executeNode(node, inputs, ctx)));
}
```

### 17.4 预设模板管线

用户选择"条件分支+自动后处理管线"的典型场景：

#### 模板 1: 生图 + 自动增强
```
[Prompt] → [Enhancer] → [ImageGen] → [Upscale] → [SaveToCanvas]
```

#### 模板 2: 条件后处理
```
[ImageGen] → [Condition: hasHumanFace?]
                ├── TRUE → [FaceRestore] → [Upscale] → [SaveToCanvas]
                └── FALSE → [Upscale] → [SaveToCanvas]
```

#### 模板 3: 批量生图管线
```
[BatchInput: prompts.csv] → [Iteration] → [ImageGen] → [Upscale] → [SaveToAssets]
```

#### 模板 4: 多风格变体
```
[Prompt] → [Switch: stylePreset]
              ├── anime → [ImageGen model=niji]
              ├── photo → [ImageGen model=flux]
              ├── art → [ImageGen model=midjourney]
              └── default → [ImageGen model=gemini]
           → [Upscale] → [SaveToCanvas]
```

### 17.5 实施优先级

| 优先级 | 任务 | 依赖 |
|---|---|---|
| P0 | 条件表达式升级 (17.2-A) | 无 |
| P0 | 重试机制 (17.3) | 无 |
| P1 | Switch 节点 (17.2-B) | 条件分支跳过执行 |
| P1 | 条件分支跳过不可达路径 (17.3) | Switch |
| P1 | Upscale 节点 (17.2-D) | RunningHub endpoint |
| P2 | Iteration 循环 (17.2-C) | 子图执行 |
| P2 | FaceRestore / BgRemove (17.2-D) | RunningHub |
| P2 | 并行执行 (17.3) | 分层拓扑 |
| P3 | BatchInput (17.2-E) | Iteration |
| P3 | StyleTransfer (17.2-D) | 待定 provider |
| P3 | 预设模板 (17.4) | Node Library UI |

### 17.6 验证标准

P2-B 完成后需通过：
1. ✅ 条件节点支持 regex / numeric / JSON path / multi-condition
2. ✅ Switch 节点能路由到 4 个分支
3. ✅ 条件为 false 的路径不执行（跳过，不是传 null）
4. ✅ 节点失败后自动重试 2 次（指数退避）
5. ✅ Upscale 节点能通过 RunningHub 或内置算法执行
6. ✅ 模板 2（条件后处理管线）可端到端运行
7. ✅ 现有 83 个测试不回归

---

## 18. 推荐下一个规划主题

P2 完成后，最自然的下一份规划应该是：

### P3：Storyboard + VideoEdit MVP
重点做：
- Shot 数据模型
- Storyboard workspace
- videoEdit 节点
- Workflow 输出回填 storyboard / canvas / assets

也就是说：
- **P1 先搭壳**
- **P2 把 Workflow 做成产品**
- **P3 再接视频编辑和分镜**

这条路线最稳。