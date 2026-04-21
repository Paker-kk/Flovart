# Workflow Productization Phase 2 Plan

> 目标：在 Phase 1 顶栏 + App Shell + 页内切换完成后，把现有节点流从“可运行原型”升级为“正式产品工作区”，重点解决节点配置、执行状态、结果预览、参数传递与产品信息架构问题。
>
> 本阶段先锁定产品边界，再按最小可运行切片推进实现；2026-04-21 起已进入 Slice 1 落地。

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

## 0.1 2026-04-21 实施状态（Slice 1 / Slice 2）

P2 已经从纯规划态进入实现态，但当前仍处于“底座 + 调试能力”阶段，不代表阶段验收结束。

### 已落地

- `WorkflowValue` / `NodeIOMap` / `WorkflowNodeRunState` 已引入，输出统一为 `text / image / video / json / empty`
- `NodeWorkflowPanel` 已接入 `executeWorkflow()`，不再停留在 fake run / demo stage
- 节点卡片与右侧 Inspector 已能显示最小运行态：`queued / running / success / error / pinned`
- `preview` / `saveToCanvas` 已能消费结构化结果，Workflow 输出可直接回填白板
- `Execute Node` / `Execute From Here` 已落地，且只执行目标子图与所需依赖闭包
- `Pin Output` 最小闭环已落地：允许固定节点最近一次输出，并在后续执行中直接复用
- 已补上 workflow engine 的文本链路、图片链路、子图执行计划与 pinned output 测试

### 当前仍未完成

- schema-driven Inspector
- Starter Flow / Template
- 资产区持久化、发布态执行、完整调试面板
- pinned output 的资产级稳定化（尤其视频 / blob URL）
- API Key 优先级规则与节点级 keyRef 语义

### 结论

当前 Slice 1 + Slice 2 的性质是“把真实运行链路与最小调试能力打通”，不是“把 Workflow 产品化全部做完”。

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

## 1.1 2026-04-21 研究补充：P2 默认策略与禁止项

这一轮对照了 2026 年仍在快速迭代的三类产品：

- **n8n**：强项是数据映射、局部执行、固定测试数据（pinning）、执行调试
- **Dify**：强项是把“Agent 能力”压进受控工作流，而不是放任模型自由发挥
- **Tapnow / 模型模板体系**：强项是 provider/template/async polling/本地缓存这类“供应商接入基础设施”

结论不是“照着抄”，而是明确 Flovart 在 P2 应该采取哪一档复杂度。

### 1.1.1 P2 推荐默认档位

#### A. 参数绑定：采用 **Hybrid-Lite**，不要直接上全表达式系统

P2 默认只支持三种绑定方式：

1. **固定值**
2. **绑定上游节点某个结构化输出字段**
3. **模板字符串插值**，例如 `{{prompt}}`、`{{imageUrl1}}`

P2 **不做**：

- 任意表达式语言
- 节点间 item-linking 兼容层
- 类 n8n 的全量表达式编辑器
- 用户自写脚本去操作节点值

原因：

- 现有 [services/workflowEngine.ts](services/workflowEngine.ts) 输出还是 `string | null`，类型系统还不够硬
- 现有 [components/nodeflow/types.ts](components/nodeflow/types.ts) 的 `NodeConfig` 还不是 schema-driven form
- 现在如果直接上表达式系统，复杂度会先于产品价值爆炸

#### B. 执行模型：优先手动执行 + 局部执行，不做发布态调度

P2 默认支持：

1. **Run Workflow**
2. **Execute Node / Execute From Here**
3. **使用上次输入重新执行当前节点**
4. **固定测试输出（Pinned / Frozen Output）**

P2 **不做**：

- 定时调度
- webhook trigger
- 环境/版本分支
- 云端生产执行视图

原因：

- Flovart 当前是创作型工作台，不是自动化平台
- 实现另一位同事如果过早做“发布态工作流”，会把重心从创作体验拖到后端运维

#### C. Agent 设计：受控工作流，不做自由代理

P2 中 Agent 节点只能是：

- Prompt Enhancer
- Planning / Decomposition
- Structured Output Extractor
- Tool-like 调用节点的上游编排器

P2 **不做**：

- 长 loop 自主代理
- 无限工具调用
- 隐式自反思链
- 黑盒自动决定整个工作流图

原因：

- Dify 2026 的经验很明确：生产可控性比“模型自己想办法”更重要
- 你当前产品目标是创作可视化，而不是 Agent sandbox

### 1.1.2 P2 必须落地的 5 个实现默认值

#### 1. 输出必须结构化

P2 不允许继续把 image / video / text / json 全塞进一个 `string`。

实现默认值：

- `text`
- `image`
- `video`
- `json`
- `empty`

这是 Node Inspector、Preview、Storyboard 回填、VideoEdit 节点的共同前提。

#### 2. Node Inspector 必须 schema-driven

P2 的 Inspector 不能继续手写 if/else 表单堆叠。

建议默认分为四组：

1. **Identity**：label / description / category
2. **Runtime**：provider / model / keyRef / timeout / retry
3. **Inputs**：固定值 / 绑定值 / 模板值
4. **Outputs & Debug**：预览 / 最后一次执行 / 错误 / pin 状态

这一步为 P5 模板系统做前置，不要等到 P5 才回头重写 Inspector。

#### 3. 节点预览必须双层

P2 默认采用两层预览：

- **节点内轻预览**：状态点 + 结果摘要 + 小缩略图
- **右侧深预览**：完整文本 / 大图 / 视频 poster / JSON viewer

P2 不建议只做一种。只做节点内预览信息不够；只做右侧预览会让画布失去“活性”。

#### 4. 节点运行状态要有稳定语义

P2 的标准状态建议固定为：

- `idle`
- `queued`
- `running`
- `success`
- `error`
- `pinned`

这里要把 `pinned` 当成一种独立可见语义，而不是隐式开发状态。n8n 的经验说明：调试工作流时，固定数据是高频能力，不是边角功能。

#### 5. 大图/视频性能保护必须从 P2 起就约束

如果 Workflow 里开始出现图片/视频节点，P2 就必须提前做这些限制：

- 视口外预览降级
- 缩略图优先于原始媒体
- object URL 生命周期统一管理
- 拖拽/缩放/框选走节流或 RAF 批处理
- Inspector 中的视频只展示 poster 或 poster + metadata，默认不同时自动播放多路视频

否则 Workflow 一接入视频节点，另一位实现者很容易把 P0 已经处理过的问题重新引回来。

### 1.1.3 P2 的禁止项

以下内容在 P2 一律视为 **超范围**：

1. 全表达式编辑器
2. 工作流发布/部署系统
3. 多人协作
4. 完整时间线/轨道编辑器
5. 供应商请求模板可视化设计器
6. 完整 Agent loop orchestration

这些内容不是不做，而是分别属于：

- P3：Storyboard / VideoEdit MVP
- P5：Provider + Model Template System
- P6：Observability
- P7：Claude / Agent / Skill Native Integration
- P8：Collaboration + Publishing

### 1.1.4 给实现方的推荐默认实现顺序

P2 内部应按下面顺序做，而不是并行乱铺：

1. **结构化 WorkflowValue 类型**
2. **Node Inspector schema 化**
3. **节点运行状态系统**
4. **节点内轻预览 + 右侧深预览**
5. **局部执行 + pinned output**
6. **节点模板与 provider/model 入口收口**

如果顺序反了，例如先做模板库、后做类型系统，后续返工概率会很高。

### 1.1.5 Dario 视角下的阶段验收标准

P2 完成时，用户第一次进入 Workflow，必须一眼明白三件事：

1. **这个节点在干什么**
2. **这个节点用哪个 provider / model 在跑**
3. **这个节点当前产出了什么，以及为什么失败**

如果用户还需要打开源码或猜测节点输入输出，P2 就没有达标。

### 1.1.6 2026-04-21 用户确认决策

本轮讨论后，P2 先按以下已确认决策推进：

1. **参数绑定复杂度**：采用 `Hybrid-Lite`
  - 固定值
  - 绑定上游字段
  - 模板插值
  - 暂不做全表达式系统
2. **调试能力**：P2 必做
  - `Execute Node`
  - `Pin Output`
3. **首批产品级节点范围**：
  - `Prompt / Template`
  - `LLM`
  - `ImageGen`
  - `VideoGen`
  - `HTTP / RunningHub`
  - `Preview / SaveToCanvas`
4. **P2 验收标准**：四项同时成立
  - 新用户 3 分钟内能搭好首个工作流
  - 节点失败原因一眼可见
  - 多 provider 可自由切换
  - 视频链路首批可跑通

这意味着 P2 不是“先做纯图片工作流”，而是从第一批就要把视频节点纳入正式产品边界；只是仍然不做时间线编辑器。

### 1.1.7 2026-04-21 当前未锁定决策位（Slice 3 前）

Slice 2 已经可以继续推进，不再等待所有问题全部拍板；但以下决策会直接影响下一轮交互层与模板层实现，必须在 Slice 3 前锁定：

1. **VideoGen 首批范围**
  - Slice 1 先按 `文生视频 / 图生视频 → 异步轮询 → 结果预览 → 回填画布` 落地
  - 是否第一批就纳入 `参考视频编辑 / 首尾帧驱动 / extend / variation` 仍未锁定
2. **API Key 优先级语义**
  - 是否固定为 `node.keyRef > provider default key > workspace active key`
  - 还是允许不同节点类型采用不同兜底策略
3. **参数绑定交互形态**
  - P2 只做 Inspector 下拉绑定
  - 还是首批就加入从节点输出拖拽到参数字段的轻量映射
4. **3 分钟首个工作流目标的达成方式**
  - 是否必须提供官方 Starter Flow / Template
  - 还是允许只靠空白画布 + 节点库完成

在这 4 项没拍板前，P2 仍然不是“范围最终锁死”；但基础运行层、结构化输出层、最小 Inspector 层可以继续先做。

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

## 2.3 执行引擎已经进入真实接线阶段
[services/workflowEngine.ts](services/workflowEngine.ts) 已经支持：
- topo sort
- 顺序执行
- provider 选 key
- LLM/image/video/runningHub/http 节点

关键点：
- `topologicalSort()`、`executeLLM()`、`executeImageGen()`、`executeVideoGen()`、`executeRunningHub()`、`executeHttpRequest()` 都已经在运行时使用
- `ExecutionContext` 已支持进度、完成、错误与白板回填回调
- 2026-04-21 Slice 1 已把 [components/NodeWorkflowPanel.tsx](components/NodeWorkflowPanel.tsx) 接到 [services/workflowEngine.ts](services/workflowEngine.ts)

### 当前问题
现在已经不是“能不能跑”，而是：
- `Execute Node / Execute From Here` 已有最小产品入口，但还没有更细粒度的执行轨迹呈现
- `Pin Output` 已有最小闭环，但还没有 pinned data 浏览与更强的媒体稳定化
- API Key 优先级与更多运行元数据还没锁死
- Inspector 仍是最小版，不是 schema-driven

---

## 2.4 NodeWorkflowPanel 仍然太大、职责太杂
[components/NodeWorkflowPanel.tsx](components/NodeWorkflowPanel.tsx) 现在同时负责：
- toolbar
- context menu
- editor canvas
- minimap
- keyboard shortcuts
- run 流程
- status 文本 / runtime 状态
- attachment drop
- inspector 基础配置

尤其是运行调度、节点卡片状态、Inspector 表单、context menu 仍堆在一个组件内。

### 结论
Slice 1 先把真实运行链路打通是合理的；但 Slice 2 仍必须继续拆成 Header / Canvas / Sidebar / Inspector，否则它会继续长成第二个 App.tsx。

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

## 5.1 已完成的第一步
2026-04-21 Slice 1 已经把 `PortValue` 从 `string | null` 升级为 `WorkflowValue | null`。

当前结构已覆盖：
- text
- image
- video
- json
- empty

### 现在剩下的问题
- 绑定 schema 还不统一
- image / video 的持久化元数据还不完整
- Inspector 还没做到按 schema 自动渲染

---

## 5.2 当前结构化输出基线
当前统一类型基线应保持为：

```ts
export type WorkflowValue =
  | { kind: 'text'; text: string }
  | { kind: 'image'; href: string; mimeType: string; width?: number; height?: number }
  | { kind: 'video'; href: string; mimeType: string; width?: number; height?: number; posterHref?: string }
  | { kind: 'json'; value: unknown }
  | { kind: 'empty' };

export type PortValue = WorkflowValue | null;

export interface NodeIOMap { [portKey: string]: PortValue }
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
现在 toolbar 仍直接写在 [components/NodeWorkflowPanel.tsx](components/NodeWorkflowPanel.tsx) 内，后续扩展会越来越乱。

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
P2 Slice 1 已先落地下列状态语义：

```ts
export type WorkflowRunStatus = 'idle' | 'queued' | 'running' | 'success' | 'error' | 'skipped' | 'pinned';
```

当前实现先由 Workflow 视图层维护节点运行态；后续如果 Header / Canvas / Inspector 正式拆分，再决定是否上收到共享 store。

### 为什么先这样做
因为当前最重要的是先让 NodeCanvas、节点卡片、Inspector 对同一套运行语义说同一种语言，而不是过早为了架构整洁再做一层状态搬运。

---

## 9.2 运行时状态来源
你已经有：
- `onProgress`
- `onNodeComplete`
- `onError`

所以不用重写执行模型，只需要：
- workflowEngine 调回调
- Workflow 视图层吃回调并维护运行态
- 节点卡片与 Inspector 消费同一份状态

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