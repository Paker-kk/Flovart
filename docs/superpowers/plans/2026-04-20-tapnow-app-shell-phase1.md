# Tapnow-Style App Shell + Top Bar + In-Page Navigation Plan

> 目标：在现有 Flovart 代码基础上，借鉴 Tapnow 的“产品形态”，实现顶部切页 Bar、页内工作区切换，以及 Workflow workspace 的正式接入。
>
> 范围：本方案聚焦 **Phase 1**，即“先把产品壳搭起来”，不直接实现完整视频编辑器，也不重写现有画布引擎。
---

## ✅ 实施记录 (2026-04-21)

| 交付物 | 文件 | 说明 |
|--------|------|------|
| Zustand Store | `stores/useWorkspaceStore.ts` | UISlice: activeView, themeMode, language；persist 中间件自动序列化 |
| App Shell | `components/AppShell.tsx` | 统一壳层：topBar / leftSidebar / main / rightSidebar / overlays |
| Top Bar | `components/TopWorkspaceBar.tsx` | 4 工作区切换（Canvas/Workflow/Storyboard/Assets）+ Settings 按钮 |
| Canvas Workspace | `components/workspaces/CanvasWorkspace.tsx` | 薄包装层，承接现有全部画布内容 |
| Workflow Workspace | `components/workspaces/WorkflowWorkspace.tsx` | 节点工作流容器（NodeWorkflowPanel 接入预留） |
| Storyboard Workspace | `components/workspaces/StoryboardWorkspace.tsx` | 占位 — Phase 3 |
| Assets Workspace | `components/workspaces/AssetsWorkspace.tsx` | 占位 — Phase 3+ |
| WorkspaceView 类型 | `types.ts` | `'canvas' \| 'workflow' \| 'storyboard' \| 'assets'` |
| App.tsx 重构 | `App.tsx` | AppShell 包裹; themeMode/language/activeView 迁移到 Zustand; 条件渲染工作区 |

**技术决策**：
- Zustand 5.0.12（57.8k⭐，~2KB gzip）— 无 Provider、slices 分片、persist 中间件
- 分批提取策略：P1 只迁移 shell 级别状态（activeView + themeMode + language）；boards/generation 配置留后续阶段
- persist key = `flovart-workspace`；旧 `themeMode.v1` 在 store 初始化时读取以保证向后兼容

**构建验证**：83 pass / 1 skip | index bundle 506KB (gzip 162KB) | build 7.1s
---

## 0. 先说结论

这件事 **可以做，而且适合现在做**。

原因：
- 你已经有主画布能力：[App.tsx](App.tsx)
- 你已经有右侧生成/历史/Agent 面板：[components/RightPanel.tsx](components/RightPanel.tsx)
- 你已经有节点流原型：[components/NodeWorkflowPanel.tsx](components/NodeWorkflowPanel.tsx)
- 你已经有 workflow 执行引擎：[services/workflowEngine.ts](services/workflowEngine.ts)

所以最优路线不是重做，而是：

1. 先加 **App Shell**
2. 再加 **Top Workspace Bar**
3. 再把页面拆成 **Canvas / Workflow / Storyboard / Assets** 四个工作区
4. 先正式接入 Workflow，再逐步补全高级 UX 和视频编辑

---

## 1. 重要约束

### 1.1 不建议直接搬 Tapnow 代码
参考仓库：`chapterv/Tapnow-Studio-PP`

原因：
- 可以学习它的产品结构、入口组织、工作区概念、节点式工作流体验
- 但不建议直接复制代码或 UI 细节
- 仓库是 GPLv3，直接挪代码会带来许可证义务

### 1.2 本阶段不做的事
本方案 **不包含**：
- 重写画布渲染器
- 重写 provider/router 层
- 一次性做完整视频编辑器
- 一次性做完整 storyboard 系统
- 一次性做高级节点动效系统

本阶段只做：
- 顶部 Bar
- 页内切换
- App Shell
- Workflow workspace 正式接入
- 结构层重构，为后续 Storyboard / Assets / VideoEdit 节点铺路

---

## 2. 目标产品结构

## 2.1 顶部主导航（页内切换）
建议顶部四个主视图：

- `Canvas`
- `Workflow`
- `Storyboard`
- `Assets`

说明：
- **Canvas**：现有无限画布 + PromptBar + 右侧生成面板
- **Workflow**：节点式工作台，正式承接 `NodeWorkflowPanel`
- **Storyboard**：先占位，为后续视频编辑/镜头分镜留入口
- **Assets**：统一历史、灵感、素材、输出内容

### 为什么用页内切换，不做多页面
因为你现在的数据是高度共享的：
- 画布元素
- Prompt
- 生成历史
- API key / model state
- workflow 输入输出

如果直接分页面，状态同步会更乱；页内切换更适合你的现状。

---

## 3. Phase 1 目标

本阶段交付完成后，产品应具备：

1. 顶部有一个固定的 `TopWorkspaceBar`
2. 用户可在页面内切换 `Canvas / Workflow / Storyboard / Assets`
3. `Canvas` 视图继续保持现在的主能力
4. `Workflow` 视图正式显示节点工作台，而不是零散原型
5. 左右侧区域进入“按视图变化”的结构，而不是永远固定一种 panel
6. 保持单页应用体验，不刷新、不跳新路由

---

## 4. 现有代码的最佳切入点

### 4.1 当前主壳层集中在 [App.tsx](App.tsx)
当前主要 UI 壳层都在这里：
- 左侧工作区侧栏：[App.tsx:2118-2155](App.tsx#L2118-L2155)
- 右侧多功能面板：[App.tsx:2158-2188](App.tsx#L2158-L2188)
- 主画布区：[App.tsx:2376-2872](App.tsx#L2376-L2872)
- 底部 PromptDock：[App.tsx:2873-2959](App.tsx#L2873-L2959)

### 4.2 Workflow 原型已经存在
- 组件：[components/NodeWorkflowPanel.tsx](components/NodeWorkflowPanel.tsx)
- 类型：[components/nodeflow/types.ts](components/nodeflow/types.ts)
- 定义：[components/nodeflow/defs.ts](components/nodeflow/defs.ts)
- 执行引擎：[services/workflowEngine.ts](services/workflowEngine.ts)

### 4.3 这说明什么
说明你现在应该做的是：
**把 App.tsx 从“单页巨型画布组件”升级为“多工作区壳层”。**

---

## 5. 目标文件结构

## 5.1 新增文件

```text
components/
  AppShell.tsx
  TopWorkspaceBar.tsx
  workspaces/
    CanvasWorkspace.tsx
    WorkflowWorkspace.tsx
    StoryboardWorkspace.tsx
    AssetsWorkspace.tsx
  storyboard/
    StoryboardEmptyState.tsx
```

## 5.2 需要修改的文件

```text
App.tsx
components/RightPanel.tsx
components/WorkspaceSidebar.tsx
components/PromptBar.tsx
components/NodeWorkflowPanel.tsx
types.ts
```

## 5.3 可选后续新增（不是 Phase 1 必做）

```text
components/nodeflow/NodeInspector.tsx
components/nodeflow/NodeLibrary.tsx
components/storyboard/ShotCard.tsx
components/storyboard/StoryboardRail.tsx
```

---

## 6. 状态设计

建议在 [types.ts](types.ts) 新增：

```ts
export type WorkspaceView = 'canvas' | 'workflow' | 'storyboard' | 'assets';
```

然后在 [App.tsx](App.tsx) 增加：

```ts
const [activeView, setActiveView] = useState<WorkspaceView>('canvas');
```

### 为什么这个 state 应该放在 App.tsx
因为 `activeView` 会影响：
- 主内容区域渲染
- 右侧面板显示什么
- 底部 PromptBar 是否显示
- 左侧工作区侧栏是否折叠/切换语义

它就是 App 壳层状态，不应该下沉到子组件。

---

## 7. 组件职责拆分

## 7.1 [components/AppShell.tsx](components/AppShell.tsx)
职责：
- 统一页面最外层布局
- 放置顶栏、左侧区、主区、右侧区
- 统一控制 padding / gap / transition

### 骨架示例

```tsx
import React from 'react';

type AppShellProps = {
  topBar: React.ReactNode;
  leftSidebar?: React.ReactNode;
  main: React.ReactNode;
  rightSidebar?: React.ReactNode;
  themeBackground: string;
};

export const AppShell: React.FC<AppShellProps> = ({
  topBar,
  leftSidebar,
  main,
  rightSidebar,
  themeBackground,
}) => {
  return (
    <div
      className="theme-aware w-screen h-screen overflow-hidden flex flex-col"
      style={{ backgroundColor: themeBackground }}
    >
      <div className="shrink-0">
        {topBar}
      </div>

      <div className="min-h-0 flex flex-1 relative">
        {leftSidebar && <div className="shrink-0">{leftSidebar}</div>}
        <div className="min-w-0 min-h-0 flex-1 relative">{main}</div>
        {rightSidebar && <div className="shrink-0">{rightSidebar}</div>}
      </div>
    </div>
  );
};
```

---

## 7.2 [components/TopWorkspaceBar.tsx](components/TopWorkspaceBar.tsx)
职责：
- 顶部主导航
- 页面内切换 bar
- 显示当前 active workspace
- 放置 Settings / Run / Export 快捷动作（可先只做 Settings）

### props 设计

```ts
import type { WorkspaceView } from '../types';

interface TopWorkspaceBarProps {
  activeView: WorkspaceView;
  onChangeView: (view: WorkspaceView) => void;
  theme: 'light' | 'dark';
  onOpenSettings?: () => void;
}
```

### 骨架示例

```tsx
import React from 'react';
import type { WorkspaceView } from '../types';

const ITEMS: Array<{ key: WorkspaceView; label: string }> = [
  { key: 'canvas', label: 'Canvas' },
  { key: 'workflow', label: 'Workflow' },
  { key: 'storyboard', label: 'Storyboard' },
  { key: 'assets', label: 'Assets' },
];

export const TopWorkspaceBar: React.FC<{
  activeView: WorkspaceView;
  onChangeView: (view: WorkspaceView) => void;
  theme: 'light' | 'dark';
  onOpenSettings?: () => void;
}> = ({ activeView, onChangeView, theme, onOpenSettings }) => {
  const isDark = theme === 'dark';

  return (
    <div className="px-4 pt-3 pb-2">
      <div
        className={`mx-auto flex max-w-[1600px] items-center justify-between rounded-2xl border px-3 py-2 backdrop-blur-xl ${
          isDark
            ? 'border-[#2A3140] bg-[#11161F]/85 text-white'
            : 'border-neutral-200 bg-white/85 text-neutral-900'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="text-sm font-semibold tracking-wide">Flovart Studio</div>
          <div className="flex items-center gap-1 rounded-xl p-1 bg-black/5 dark:bg-white/5">
            {ITEMS.map((item) => {
              const active = item.key === activeView;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onChangeView(item.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    active
                      ? isDark
                        ? 'bg-white text-black shadow'
                        : 'bg-neutral-900 text-white shadow'
                      : isDark
                        ? 'text-[#98A2B3] hover:text-white hover:bg-white/5'
                        : 'text-neutral-500 hover:text-neutral-900 hover:bg-black/5'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenSettings}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'
            }`}
          >
            Settings
          </button>
        </div>
      </div>
    </div>
  );
};
```

---

## 7.3 [components/workspaces/CanvasWorkspace.tsx](components/workspaces/CanvasWorkspace.tsx)
职责：
- 承接你现在的主画布内容
- 本质上是把 [App.tsx:2376-2959](App.tsx#L2376-L2959) 这块往外包一层

### 这里不建议立刻拆得太细
Phase 1 只要做到：
- 保持现有行为
- 从 `App.tsx` 搬出主画布区
- 不影响当前生成、选中、裁剪、PromptBar 的工作方式

### 骨架示例

```tsx
import React from 'react';

interface CanvasWorkspaceProps {
  canvasStage: React.ReactNode;
  promptDock?: React.ReactNode;
}

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = ({
  canvasStage,
  promptDock,
}) => {
  return (
    <div className="relative w-full h-full min-h-0">
      <div className="absolute inset-0">{canvasStage}</div>
      {promptDock && (
        <div className="absolute inset-x-0 bottom-0 z-[48]">{promptDock}</div>
      )}
    </div>
  );
};
```

---

## 7.4 [components/workspaces/WorkflowWorkspace.tsx](components/workspaces/WorkflowWorkspace.tsx)
职责：
- 正式承接 `NodeWorkflowPanel`
- 让节点工作流成为主视图之一
- 后续可在这个页面追加 NodeLibrary / Inspector / templates

### 设计建议
Phase 1 先做成两层：
- 顶部 workspace header（标题 + 简短说明 + run 状态）
- 下方完整节点工作台

### 骨架示例

```tsx
import React from 'react';

interface WorkflowWorkspaceProps {
  header?: React.ReactNode;
  workflowPanel: React.ReactNode;
}

export const WorkflowWorkspace: React.FC<WorkflowWorkspaceProps> = ({
  header,
  workflowPanel,
}) => {
  return (
    <div className="flex h-full min-h-0 flex-col px-4 pb-4">
      <div className="shrink-0 pb-3">{header}</div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-[color:var(--panel-border,#2A3140)]">
        {workflowPanel}
      </div>
    </div>
  );
};
```

---

## 7.5 [components/workspaces/StoryboardWorkspace.tsx](components/workspaces/StoryboardWorkspace.tsx)
职责：
- 先占位，不做完整功能
- 防止以后加 Storyboard 时再次改 App 壳层

### 骨架示例

```tsx
import React from 'react';

export const StoryboardWorkspace: React.FC = () => {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <div>
        <div className="text-lg font-semibold">Storyboard Workspace</div>
        <p className="mt-2 text-sm opacity-70">
          This area is reserved for shot cards, video planning, and future timeline/edit flows.
        </p>
      </div>
    </div>
  );
};
```

---

## 7.6 [components/workspaces/AssetsWorkspace.tsx](components/workspaces/AssetsWorkspace.tsx)
职责：
- 统一素材 / 历史 / 视频输出入口
- Phase 1 先做占位

### 骨架示例

```tsx
import React from 'react';

export const AssetsWorkspace: React.FC = () => {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <div>
        <div className="text-lg font-semibold">Assets Workspace</div>
        <p className="mt-2 text-sm opacity-70">
          This area will unify history, saved assets, generated videos, and workflow outputs.
        </p>
      </div>
    </div>
  );
};
```

---

## 8. App.tsx 的精确改法

## 8.1 新增 import
建议增加：

```tsx
import { AppShell } from './components/AppShell';
import { TopWorkspaceBar } from './components/TopWorkspaceBar';
import { CanvasWorkspace } from './components/workspaces/CanvasWorkspace';
import { WorkflowWorkspace } from './components/workspaces/WorkflowWorkspace';
import { StoryboardWorkspace } from './components/workspaces/StoryboardWorkspace';
import { AssetsWorkspace } from './components/workspaces/AssetsWorkspace';
import type { WorkspaceView } from './types';
```

## 8.2 新增 state

```tsx
const [activeView, setActiveView] = useState<WorkspaceView>('canvas');
```

## 8.3 用 `AppShell` 包裹原 return
当前 [App.tsx:2102](App.tsx#L2102) 开始的根节点，要改成：

```tsx
return (
  <AppShell
    themeBackground={themePalette.appBackground}
    topBar={
      <TopWorkspaceBar
        activeView={activeView}
        onChangeView={setActiveView}
        theme={resolvedTheme}
        onOpenSettings={() => setIsSettingsPanelOpen(true)}
      />
    }
    leftSidebar={
      activeView === 'canvas' ? (
        <WorkspaceSidebar ... />
      ) : null
    }
    rightSidebar={
      activeView === 'canvas' ? (
        <RightPanel ... />
      ) : null
    }
    main={
      <>
        {activeView === 'canvas' && (
          <CanvasWorkspace
            canvasStage={/* 原来的 canvas stage */}
            promptDock={/* 原来的 PromptDock */}
          />
        )}

        {activeView === 'workflow' && (
          <WorkflowWorkspace
            header={/* 简单 header */}
            workflowPanel={
              <NodeWorkflowPanel ... />
            }
          />
        )}

        {activeView === 'storyboard' && <StoryboardWorkspace />}
        {activeView === 'assets' && <AssetsWorkspace />}
      </>
    }
  />
)
```

---

## 9. NodeWorkflowPanel 的正式接入方式

现在 [NodeWorkflowPanel.tsx](components/NodeWorkflowPanel.tsx) 已经有足够多的 props：
- prompt
- generationMode
- model options
- attachments
- canvasImages
- onRunWorkflow

这非常适合被直接挂进 Workflow workspace。

## 建议接法
在 [App.tsx](App.tsx) 中组装：

```tsx
<NodeWorkflowPanel
  prompt={prompt}
  setPrompt={setPrompt}
  generationMode={generationMode}
  setGenerationMode={setGenerationMode}
  selectedImageModel={modelPreference.imageModel}
  selectedVideoModel={modelPreference.videoModel}
  imageModelOptions={dynamicModelOptions.image}
  videoModelOptions={dynamicModelOptions.video}
  onImageModelChange={(model) => setModelPreference(prev => ({ ...prev, imageModel: model }))}
  onVideoModelChange={(model) => setModelPreference(prev => ({ ...prev, videoModel: model }))}
  attachments={promptAttachments}
  canvasImages={elements
    .filter((el): el is Extract<typeof el, { type: 'image' }> => el.type === 'image')
    .map((el) => ({ id: el.id, name: el.name, href: el.href, mimeType: el.mimeType }))}
  onRemoveAttachment={handleRemovePromptAttachment}
  onUploadFiles={handleAddPromptAttachmentFiles}
  onDropCanvasImage={handleAddAttachmentFromCanvas}
  isRunning={isLoading}
  onRunWorkflow={async ({ autoEnhance, enhanceMode, stylePreset }) => {
    if (autoEnhance) {
      await handleEnhancePrompt({
        prompt,
        mode: enhanceMode,
        stylePreset,
      });
    }
    await handleGenerate(undefined, 'prompt');
  }}
/>
```

### 注意
这个接法是 **Phase 1 过渡方案**。
它的目标不是完整 workflow engine 直连，而是先让 Workflow workspace 成为产品的一部分。

后续 Phase 2 再做：
- 真正接 `executeWorkflow()`
- 真正把 node output 接入画布 / 历史 / 资产系统

---

## 10. RightPanel 怎么处理

当前 [components/RightPanel.tsx](components/RightPanel.tsx) 是 Canvas 时代的右侧面板，内容很多：
- history
- inspiration
- agent
- runningHub

## Phase 1 建议
- `Canvas` 视图继续保留 `RightPanel`
- `Workflow` 视图先不复用 `RightPanel`
- `Workflow` 视图右侧暂时不做 Inspector，先把工作台放进去

### 为什么不急着复用 RightPanel
因为 RightPanel 的语义是“画布上下文辅助面板”，不是 workflow inspector。强行复用会更乱。

---

## 11. PromptBar 怎么处理

当前 [PromptBar.tsx](components/PromptBar.tsx) 明确是 Canvas 模式下的底部 dock 交互：[PromptBar.tsx:17-69](components/PromptBar.tsx#L17-L69)

## Phase 1 建议
- `Canvas` 视图保留 PromptBar
- `Workflow` 视图先不显示底部 PromptBar
- Workflow 内部由 `NodeWorkflowPanel` 自己管理 prompt 流程

### 原因
Workflow 的信息架构本来就不同：
- 不是单 Prompt → 单输出
- 而是多节点 → 多输入输出流转

所以别把 PromptBar 硬塞到 Workflow 下面。

---

## 12. 动画与交互建议（Phase 1 先做轻量版）

因为项目当前没有 `framer-motion`，而且 [package.json](package.json) 里也没有相关依赖，所以第一阶段先用 CSS transition 即可。

## 顶栏切换动效建议

### Tab Active 状态
- 胶囊切换
- `transition-all duration-200 ease-out`
- hover 有轻微背景变化

### 主视图切换
建议先加简单过渡：

```tsx
<div className="h-full w-full transition-opacity duration-200">
  {activeView === 'canvas' && <CanvasWorkspace ... />}
</div>
```

### 不建议第一阶段就做的事
- 大量 spring 物理动画
- 连线流动动画
- 页面级共享元素动画

这些可以留到第二阶段。

---

## 13. 实施顺序（建议一天内能起骨架）

### Step 1
新增 `WorkspaceView` 类型到 [types.ts](types.ts)

### Step 2
新建 [components/AppShell.tsx](components/AppShell.tsx)

### Step 3
新建 [components/TopWorkspaceBar.tsx](components/TopWorkspaceBar.tsx)

### Step 4
新建 4 个 workspace 组件：
- [components/workspaces/CanvasWorkspace.tsx](components/workspaces/CanvasWorkspace.tsx)
- [components/workspaces/WorkflowWorkspace.tsx](components/workspaces/WorkflowWorkspace.tsx)
- [components/workspaces/StoryboardWorkspace.tsx](components/workspaces/StoryboardWorkspace.tsx)
- [components/workspaces/AssetsWorkspace.tsx](components/workspaces/AssetsWorkspace.tsx)

### Step 5
在 [App.tsx](App.tsx) 增加 `activeView`

### Step 6
把现有 Canvas 内容包进 `CanvasWorkspace`

### Step 7
把 `NodeWorkflowPanel` 挂到 `WorkflowWorkspace`

### Step 8
验证四个 tab 可以页内切换，且 Canvas 原行为不坏

---

## 14. 验证方法

## 基础验证
1. 启动开发环境
   ```bash
   npm run dev
   ```

2. 检查顶栏是否出现
3. 检查能否切换：Canvas / Workflow / Storyboard / Assets
4. 切回 Canvas 时，原有功能是否仍正常：
   - 画布缩放/拖动
   - 选中元素
   - PromptBar 生图
   - 右侧 RightPanel
5. 切到 Workflow 时，`NodeWorkflowPanel` 是否正常展示
6. 切换视图时，页面不能 reload

## 回归验证
- [WorkspaceSidebar.tsx](components/WorkspaceSidebar.tsx) 在 Canvas 模式仍正常
- [RightPanel.tsx](components/RightPanel.tsx) 在 Canvas 模式仍正常
- [PromptBar.tsx](components/PromptBar.tsx) 在 Canvas 模式仍正常
- 设置弹窗仍能正常打开

---

## 15. 本阶段交付标准

只要你做到以下几点，这一阶段就算成功：

- 有一个顶部 Bar
- 可以页内切换 4 个工作区
- Canvas 视图不坏
- Workflow 视图正式出现，不再只是隐藏原型
- Storyboard / Assets 先有产品级入口占位

这一步完成之后，你的产品形态就会从：

> 单画布 AI 工具

升级成：

> 多工作区的 AI 创作工作台

---

## 16. Phase 2 预告（不是这次要做的）

等 Phase 1 壳层稳定后，再做：

1. Workflow 右侧 `NodeInspector`
2. provider/model/params per-node 编辑
3. 执行状态可视化
4. Storyboard 真实数据结构
5. VideoEdit node
6. Assets workspace 真正统一历史/视频/工作流产出

---

## 17. 最后建议

你现在最容易做错的一点，是一上来就想：
- 顶栏
- 节点流
- 视频编辑
- Storyboard
- 动画
- 多 provider
全部一起上。

我建议你严格按下面顺序：

1. **先搭壳层**
2. **再接 Workflow**
3. **再补 Inspector**
4. **再做 Storyboard / VideoEdit**
5. **最后打磨动效**

这样你每一步都能有一个“看得见的产品升级”，而不是中途陷进大重构。
