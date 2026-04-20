# Storyboard + VideoEdit MVP Phase 3 Plan

> 目标：在 Phase 1（App Shell）和 Phase 2（Workflow 产品化）之后，落一套最小可行的 **Storyboard + VideoEdit MVP**，让产品从“AI 画布 + 节点工作流”升级成“可规划镜头、可做轻量视频编辑、可让节点工作流服务镜头生产”的创作平台。
>
> 本阶段只做规划，不写代码。

---

## 0. 先说结论

你现在的代码 **还没有真正的视频编辑系统**。

当前视频相关能力主要是：
- `GenerationMode = 'image' | 'video' | 'keyframe'`，见 [types.ts:7](types.ts#L7)
- `VideoElement` 只是一个画布元素，只有 `href/width/height/mimeType`，见 [types.ts:63-69](types.ts#L63-L69)
- `useGeneration.ts` 支持：
  - 普通视频生成，见 [hooks/useGeneration.ts:705-810](hooks/useGeneration.ts#L705-L810)
  - 首尾帧/单帧动画模式，见 [hooks/useGeneration.ts:611-702](hooks/useGeneration.ts#L611-L702)
- `ElementToolbar.tsx` 对视频只提供下载，没有任何编辑能力，见 [components/ElementToolbar.tsx:126](components/ElementToolbar.tsx#L126)

所以 P3 的方向不应该是“直接做完整视频编辑器”，而应该是：

> **先做 Storyboard 作为镜头组织层，再做 VideoEdit MVP 作为轻量编辑层。**

这样最符合你现有代码形态，也最适合未来和 Workflow 打通。

---

## 1. P3 的产品目标

P3 完成后，产品应该具备：

1. 有一个 **Storyboard Workspace**，不再只是占位页
2. 用户可以创建 `Shot`（镜头卡）
3. 每个 Shot 可以绑定：
   - prompt
   - 参考图
   - 参考视频
   - 时长/比例
   - 输出结果
4. 用户可以把 Shot 一键送到 Workflow 或 Canvas 生成
5. 视频元素可以进行最小编辑：
   - trim（裁时长）
   - extend（续写）
   - variation / restyle（变体）
   - replace poster / keyframe（替换关键帧）
6. 视频输出可以回填到：
   - Canvas
   - Assets
   - Storyboard Shot

---

## 2. 现有代码现状诊断

## 2.1 `VideoElement` 太轻，不够支撑编辑
当前 [types.ts:63-69](types.ts#L63-L69)：

```ts
export interface VideoElement extends CanvasElementBase {
  type: 'video';
  href: string; // Blob URL
  width: number;
  height: number;
  mimeType: string;
}
```

### 问题
它只能表达：
- “画布上有一个视频框，能播一个 URL”

它不能表达：
- 来源是上传 / 生成 / 编辑 / workflow 输出
- 这个视频剪了多少秒
- 是不是由某个 parent video 派生
- 有没有 prompt / provider / model 元数据
- 有没有 poster
- 有没有 trimIn / trimOut
- 有没有镜头归属

### 结论
P3 第一步一定是 **升级 VideoElement 数据模型**。

---

## 2.2 当前“keyframe”不是完整视频编辑，而是特殊生成模式
当前 [hooks/useGeneration.ts:611-702](hooks/useGeneration.ts#L611-L702) 的 keyframe 模式，本质是：
- 选一张或多张图
- 生成一个动画 clip
- 放到画布

### 它不是：
- timeline 编辑
- 首尾帧显式控制器
- 可回溯编辑链
- shot-based 镜头系统

所以不要把它误当成已经有视频编辑系统；它只是一个“生成变种”。

---

## 2.3 当前视频 toolbar 几乎没有编辑入口
[components/ElementToolbar.tsx](components/ElementToolbar.tsx) 对 video 的支持只有：
- download，见 [components/ElementToolbar.tsx:126](components/ElementToolbar.tsx#L126)

### 结论
视频编辑的 UI 入口需要从零开始建立。

---

## 2.4 当前还没有 storyboard 数据模型
目前 repo 中并没有真正的：
- `StoryboardShot`
- `StoryboardSequence`
- `TimelineClip`
- `ShotOutput`
这类结构。

### 结论
P3 的核心不是改一个组件，而是引入一层新的产品数据结构。

---

## 3. P3 的正确信息架构

建议把 Storyboard 视图做成三栏：

```text
┌──────────────────────────────────────────────────────────────┐
│ Storyboard Header                                            │
├──────────────┬──────────────────────────────┬───────────────┤
│ Shot List    │ Shot Detail / Preview         │ Output / Refs │
│ / Scene Rail │ prompt / refs / run / review  │ images/videos │
└──────────────┴──────────────────────────────┴───────────────┘
```

### 左栏：Shot Rail
- 镜头列表
- 拖拽排序
- 分组（场景）
- 快速添加镜头

### 中间：Shot Detail
- prompt
- negative prompt（如果后续有）
- refs
- duration
- aspect ratio
- run buttons
- 小预览区

### 右栏：Output / Refs
- 当前镜头的 image/video 输出
- 参考图
- 参考视频
- 可一键送到 Canvas / Workflow / Assets

---

## 4. 建议新增数据模型

## 4.1 `StoryboardShot`
建议在 [types.ts](types.ts) 新增：

```ts
export interface StoryboardShot {
  id: string;
  title: string;
  prompt: string;
  notes?: string;
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9';
  durationSec?: number;

  referenceImageIds?: string[];
  referenceVideoIds?: string[];

  outputElementIds?: string[];
  primaryOutputId?: string | null;

  status?: 'idle' | 'draft' | 'queued' | 'running' | 'done' | 'error';
  error?: string | null;

  workflowId?: string | null;
  createdAt: number;
  updatedAt: number;
}
```

### 作用
它会成为：
- Storyboard workspace 的核心实体
- Workflow 输出的“镜头归属”锚点
- 视频编辑行为的上下文入口

---

## 4.2 `StoryboardProject`

```ts
export interface StoryboardProject {
  id: string;
  name: string;
  shots: StoryboardShot[];
  activeShotId?: string | null;
  createdAt: number;
  updatedAt: number;
}
```

### 为什么需要 project
因为未来你不可能只做一个 shot list。需要：
- 多个 storyboard
- 不同项目的镜头组织
- 导出 / 导入 / 保存

---

## 4.3 升级 `VideoElement`
建议改 [types.ts](types.ts) 中的 `VideoElement`：

```ts
export interface VideoElement extends CanvasElementBase {
  type: 'video';
  href: string;
  width: number;
  height: number;
  mimeType: string;

  storageKey?: string;
  poster?: string;
  durationSec?: number;
  fps?: number;

  trimInSec?: number;
  trimOutSec?: number;

  sourceKind?: 'uploaded' | 'generated' | 'edited' | 'workflow';
  parentVideoId?: string;
  shotId?: string | null;

  generationMeta?: {
    provider?: string;
    model?: string;
    prompt?: string;
  };
}
```

### 为什么这一层最重要
因为后面：
- trim
- extend
- variation
- workflow 输出
- storyboard 归档
全都需要它。

---

## 5. Storyboard Workspace 文件规划

建议新增：

```text
components/storyboard/
  StoryboardHeader.tsx
  StoryboardRail.tsx
  ShotCard.tsx
  ShotDetailPanel.tsx
  ShotOutputPanel.tsx
  ShotReferenceDropzone.tsx
  StoryboardEmptyState.tsx

components/workspaces/
  StoryboardWorkspace.tsx
```

### 职责拆分

#### `StoryboardWorkspace.tsx`
- 壳层布局
- 左中右三栏

#### `StoryboardRail.tsx`
- 镜头列表
- 排序
- 选中镜头

#### `ShotCard.tsx`
- 左栏中的每个镜头卡片
- 小缩略图 + 状态点 + 标题

#### `ShotDetailPanel.tsx`
- prompt
- notes
- aspect ratio
- duration
- run actions

#### `ShotOutputPanel.tsx`
- 当前镜头输出
- 支持 image/video
- 支持一键发送到 canvas / assets / workflow

---

## 6. VideoEdit MVP 目标定义

## 6.1 P3 不做完整 NLE
不要在 P3 里直接做：
- 多轨时间线
- 复杂关键帧系统
- 剪辑轨道混音
- 多片段拼接导出器

这些会把项目直接拖进另一个产品维度。

---

## 6.2 P3 只做 4 个轻编辑能力

### 1. Trim
对已有 `VideoElement` 设置：
- `trimInSec`
- `trimOutSec`

#### 优先目标
- 先实现“播放层裁时长 + 元数据保存”
- 不急着做 destructive re-encode

#### 好处
- 成本最低
- 用户感知最强
- 为以后时间线编辑打基础

---

### 2. Extend
把当前视频当作“已有镜头”，继续生成下一个延展版本。

#### 方式
- 复用当前 `generateVideoWithProvider()` 思路
- 先从当前视频生成 poster / 尾帧语义
- 再发续写请求
- 返回新的 `VideoElement`

#### 注意
P3 不要求每家 provider 都支持“真视频续写”。
可以先做：
- provider 支持时走真 extend
- provider 不支持时走“尾帧 + prompt 再生成”的 fallback 思路

---

### 3. Variation / Restyle
对一个已有 clip 做：
- 风格变化
- prompt 重解释
- 同镜头变体

这本质上是“AI 重新生成衍生版本”，不是传统剪辑。

---

### 4. Replace Poster / Keyframe
允许用户：
- 替换封面帧
- 指定新的参考帧
- 用作后续 workflow / storyboard 输入

这个功能很便宜，但产品感知会很强。

---

## 7. VideoEdit UI 入口规划

建议新增：

```text
components/video/
  VideoEditPopover.tsx
  VideoTrimPopover.tsx
  VideoVariantPanel.tsx
```

并修改：
- [components/ElementToolbar.tsx](components/ElementToolbar.tsx)

### 入口设计
当前视频 toolbar 只有 download。
P3 后建议变成：
- Download
- Trim
- Extend
- Variation
- Send to Storyboard

### 原则
不要让视频操作和图片 toolbar 混在一起乱长。
最好视频有自己的一组 button cluster。

---

## 8. Workflow 与 Storyboard 的关系设计

这是 P3 最关键的产品关系问题。

## 8.1 不要让 Storyboard 取代 Workflow
Storyboard 是：
- 镜头组织层
- 创作规划层
- 输出归档层

Workflow 是：
- 执行逻辑层
- 多 provider / 多节点 / 参数编排层

### 正确关系
- Storyboard 可以调用 Workflow
- Workflow 输出可以回填 Storyboard
- 但 Storyboard 不应该吞掉 Workflow

---

## 8.2 推荐的数据流

```text
Storyboard Shot
   ↓
Launch Workflow / Generate Directly
   ↓
Workflow / Provider Output
   ↓
Create Element (image/video)
   ↓
Attach to Shot + Save to Assets + Optional place on Canvas
```

### 这样做的好处
- Shot 成为“生产单元”
- Workflow 成为“生产引擎”
- Canvas 成为“摆放和组合空间”

这三层职责清楚。

---

## 9. P3 推荐文件改造清单

### 新增

```text
types.ts                      // 增加 StoryboardShot / StoryboardProject / VideoElement 扩展
components/workspaces/StoryboardWorkspace.tsx
components/storyboard/StoryboardHeader.tsx
components/storyboard/StoryboardRail.tsx
components/storyboard/ShotCard.tsx
components/storyboard/ShotDetailPanel.tsx
components/storyboard/ShotOutputPanel.tsx
components/storyboard/ShotReferenceDropzone.tsx
components/video/VideoTrimPopover.tsx
components/video/VideoEditPopover.tsx
utils/storyboardStore.ts
```

### 修改

```text
App.tsx
components/ElementToolbar.tsx
hooks/useGeneration.ts
components/RightPanel.tsx
services/workflowEngine.ts
components/nodeflow/defs.ts
components/nodeflow/types.ts
```

---

## 10. P3 的 store 规划

建议新增 [utils/storyboardStore.ts](utils/storyboardStore.ts)

### 它负责：
- `StoryboardProject[]`
- `activeStoryboardId`
- `activeShotId`
- 本地持久化
- 镜头排序
- shot 输出归档

### 为什么不直接塞进 App.tsx
因为 Storyboard 是一条完整产品线，不应该继续把 [App.tsx](App.tsx) 变大。

---

## 11. 节点类型扩展建议（P3）

修改 [components/nodeflow/defs.ts](components/nodeflow/defs.ts)

建议新增两个节点：

### `loadVideo`
输入：无
输出：video

用途：
- 从画布/资产/storyboard 注入视频到 workflow

### `videoEdit`
输入：
- text
- video
- image（可选）

输出：
- video

用途：
- trim / extend / variation / restyle / keyframe override

### 说明
P3 即使暂时没把 provider 真接完，也应该先把节点语义立起来。

---

## 12. 生成链路复用建议

当前 [hooks/useGeneration.ts](hooks/useGeneration.ts) 已经承担了主生成逻辑。

### P3 不建议的做法
不要把全部 Storyboard 生成逻辑直接硬复制一份到 Storyboard 组件里。

### P3 推荐做法
把现有逻辑逐步抽成可复用动作：
- `generateImageAction(...)`
- `generateVideoAction(...)`
- `generateKeyframeAction(...)`

然后：
- Canvas PromptBar 调这些 action
- Storyboard ShotDetail 调这些 action
- Workflow output node 也调这些 action 或其更底层版本

这样未来不会有三套生成链。

---

## 13. UX 规划（P3）

## 13.1 Storyboard 不要做成表格后台
镜头卡应该像“创作卡片”，不是配置表单。

建议每个 `ShotCard` 显示：
- 镜头标题
- prompt 摘要
- 时长 / 比例 badge
- 当前主输出缩略图
- status 点（idle/running/done/error）

---

## 13.2 Shot Detail 要像 creative panel
中间 Detail Panel 建议顺序：
1. Prompt
2. Notes
3. References
4. Settings（ratio / duration）
5. Actions（Generate / Send to Workflow / Extend / Variation）

---

## 13.3 视频编辑 popover 要轻，不要像专业剪辑器
P3 的目标是：
- 好上手
- 快速反馈
- 不吓跑用户

所以 Trim UI 建议：
- 一个简洁的范围滑杆
- 当前 in/out 秒数
- Apply / Duplicate as New

而不是一上来就做大型 timeline。

---

## 14. 执行顺序建议

### Step 1：先补数据模型
- `StoryboardShot`
- `StoryboardProject`
- 扩展 `VideoElement`

### Step 2：做 Storyboard workspace 最小闭环
- 左栏 ShotRail
- 中间 ShotDetail
- 右栏 ShotOutput

### Step 3：把 shot 输出和现有元素系统打通
- 输出 video/image 能回填 `outputElementIds`
- 能一键送画布

### Step 4：做视频编辑 MVP
- Trim
- Extend
- Variation
- Replace poster / keyframe

### Step 5：给 workflow 加 `loadVideo` / `videoEdit`
- Storyboard 和 Workflow 形成闭环

---

## 15. 验证标准

P3 做完后，至少要能满足：

1. 能创建 storyboard
2. 能添加多个 shot
3. 每个 shot 能保存 prompt / refs / outputs
4. 能从 shot 发起视频生成
5. 视频输出能回到 shot
6. 视频元素至少能 trim 和 extend
7. workflow 能开始理解“video 输入”和“video 编辑节点”

---

## 16. 风险点

### 风险 1：Storybard 和 Canvas 状态耦合过深
如果你把 shot 直接等同于 canvas element，会很快失控。

### 风险 2：VideoEdit 如果过度做成“真剪辑器”会爆炸
P3 一定要克制，只做轻编辑能力。

### 风险 3：多入口生成容易形成多套逻辑
Canvas / Workflow / Storyboard 都可能生成内容，所以一定要逐步抽 action 层。

---

## 17. 我的建议（最重要）

P3 的正确路线不是：
> 先做复杂视频编辑，再想 storyboard。

而是：
> **先有 Storyboard，再让 VideoEdit 变成 Storyboard 的一个能力。**

因为你的产品未来更像：
- 先规划镜头
- 再生产镜头
- 再做变体和轻编辑
- 再送去 workflow / canvas / assets

这条路径比“突然塞进一个视频编辑器”自然得多。

---

## 18. 推荐的下一个规划主题

P3 之后最自然的 P4 是：

### P4：Motion + Micro-interaction Polish
重点做：
- 顶栏切页 spring
- 节点执行 edge 动画
- Shot 卡片状态动画
- Output 回填反馈
- Workflow / Storyboard / Canvas 之间的跨区动画

也就是：
- P1 搭壳
- P2 产品化 Workflow
- P3 做 Storyboard + VideoEdit MVP
- P4 打磨高级交互与弹性动画
