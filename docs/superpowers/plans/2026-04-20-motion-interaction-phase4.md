# Motion + Interaction Polish Phase 4 Plan

> 目标：在 Phase 1（App Shell）、Phase 2（Workflow 产品化）、Phase 3（Storyboard + VideoEdit MVP）完成后，统一整套产品的动效语言与交互反馈，把当前“能用”的界面升级成“高级、柔和、有生命感但不浮夸”的创作工作台体验。
>
> 本阶段只做规划，不写代码。

---

## 0. 先说结论

你现在的项目已经不是“完全没动效”，而是：

- **局部组件已经有不错的轻动效基础**
- 但 **没有统一 motion system**
- 也没有形成“跨页面、跨工作区、跨节点/素材/镜头”的一致交互语言

从现有代码看：
- 主题切换有 transition，[styles.css:63-73](styles.css#L63-L73)
- PromptDock 有进入动效，[styles.css:171-200](styles.css#L171-L200)
- Canvas / right panel / shell padding 有缓动，[styles.css:154-158](styles.css#L154-L158) [App.tsx:2381](App.tsx#L2381)
- Toolbar、RightPanel、PromptDock 等组件有 hover/transform/opacity 过渡，[components/Toolbar.tsx](components/Toolbar.tsx) [components/RightPanel.tsx:450-489](components/RightPanel.tsx#L450-L489)

### 现在的核心问题
不是“没有动画”，而是：
1. 动效是**局部零散存在**的
2. 没有统一 token（duration/easing/elevation/scale）
3. 没有跨工作区的切换语言
4. Workflow / Storyboard / Assets 缺少强反馈
5. 节点执行态和镜头状态还没有“流动感”

所以 P4 的核心不是“多加动画”，而是：

> **建立一套统一的 motion system，让整个产品从工具感变成创作系统感。**

---

## 1. P4 的目标边界

P4 完成后，产品应具备：

1. 顶栏切页有统一的切换动效
2. 各 workspace 之间有一致的页面过渡
3. Workflow 节点有清晰的 hover / drag / run / success / error 动效
4. Storyboard Shot 卡片有状态反馈动效
5. Assets / Output 回填到 Canvas / Storyboard / Workflow 时有可感知反馈
6. 交互整体“柔和、有弹性，但不繁重、不掉帧”
7. 支持 `prefers-reduced-motion`

### 本阶段仍然不做
- 夸张 3D 动画
- 粒子特效型 UI
- 大量高成本 GPU 特效
- 过度依赖 motion library 的全局重构

---

## 2. 现有动效基础诊断

## 2.1 现在已有的优点

### 主题切换有基础过渡
[styles.css:63-73](styles.css#L63-L73)

```css
transition:
  background-color 0.25s ease,
  color 0.25s ease;
```

这说明你已经在追求“柔和切换”，这是好事。

### PromptDock 已经有不错的浮入感
[styles.css:171-200](styles.css#L171-L200)

特点：
- 轻微浮动
- 小 scale
- 比较克制

这是一个可作为全局 motion 语言参考的基础。

### RightPanel 收起/展开已经有结构化 transform
[components/RightPanel.tsx:474-489](components/RightPanel.tsx#L474-L489)

说明：
- 你已经用 `translate + scale + opacity` 组合，而不是单纯 display none
- 这是一条正确路线

---

## 2.2 当前存在的问题

### 问题 1：没有统一 motion token
当前代码里的：
- `duration-300`
- `0.35s cubic-bezier(0.4, 0, 0.2, 1)`
- `0.25s ease-out`
- `0.45s cubic-bezier(0.2, 0.8, 0.2, 1)`

分布很多，但没有统一定义。

### 后果
- 某些地方显得太硬
- 某些地方显得拖
- 页面与页面之间的“手感”不一致

---

### 问题 2：动效主要是“显示/隐藏”，不是“状态反馈”
现在大量动效还是：
- 出现
- 悬浮
- hover
- 收起展开

但真正高级的创作工具体验需要：
- 执行中反馈
- 成功反馈
- 错误反馈
- 回填反馈
- 节点流动反馈

也就是“状态动效”，而不是只有“容器动效”。

---

### 问题 3：跨 workspace 没有连续性
随着 P1/P2/P3 增加：
- Canvas
- Workflow
- Storyboard
- Assets

如果没有统一切页动效和状态层级，用户会感觉像在切不同工具，而不是一个系统。

---

## 3. P4 的核心设计原则

## 3.1 动效服务于理解，不服务于炫技
每一个动画都应该回答一个问题：

- 这个元素现在激活了吗？
- 这个动作成功了吗？
- 这个结果去哪了？
- 这个节点现在跑到哪一步了？

### 如果动画不能回答信息问题，就不该存在。

---

## 3.2 小而准，重反馈，轻表演
你的产品更适合：
- 微小 spring
- 轻微 scale
- 轻 glow
- 精准 opacity/translate

不适合：
- 大幅 bounce
- 长路径飞行动画
- 大面积 blur/frosted 叠加动画

---

## 3.3 先做 motion token，再做细节表现
P4 的第一步不是先做节点发光，而是先统一：
- duration
- easing
- scale curve
- elevation shadow
- hover lift

不然所有动画会继续散。

---

## 4. 推荐新增的 motion 基础文件

建议新增：

```text
styles/
  motion.css

utils/
  motionTokens.ts
```

### `motion.css` 负责
- CSS variables
- keyframes
- 通用 motion utility class

### `motionTokens.ts` 负责
- TS 侧共享 token（如果某些动画要走 JS）

---

## 5. 推荐的 motion token 体系

建议统一这些 token：

### Duration
```css
--motion-fast: 140ms;
--motion-base: 220ms;
--motion-medium: 320ms;
--motion-slow: 420ms;
```

### Easing
```css
--ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
--ease-soft-out: cubic-bezier(0.22, 1, 0.36, 1);
--ease-spring-soft: cubic-bezier(0.2, 0.8, 0.2, 1);
--ease-emphasis: cubic-bezier(0.16, 1, 0.3, 1);
```

### Scale
```css
--scale-hover: 1.015;
--scale-press: 0.985;
--scale-enter: 0.985;
```

### Shadow / Elevation
```css
--shadow-floating-sm: 0 12px 30px rgba(15, 23, 42, 0.10);
--shadow-floating-md: 0 20px 44px rgba(15, 23, 42, 0.16);
--shadow-floating-lg: 0 30px 70px rgba(15, 23, 42, 0.22);
```

---

## 6. 顶部 Bar 与 Workspace 切页动效

## 6.1 TopWorkspaceBar active tab
适用于：
- [components/TopWorkspaceBar.tsx](components/TopWorkspaceBar.tsx)（P1 已规划）

### 建议效果
- 当前激活 tab 使用滑动胶囊背景
- 切换时：
  - 胶囊横向平移
  - 文本颜色淡入切换
  - 整体 180–220ms

### 视觉感受
像 Linear / Arc / Figma 那类工具的轻滑块，不要像移动端重 tab。

---

## 6.2 Workspace 视图切换
适用于：
- `CanvasWorkspace`
- `WorkflowWorkspace`
- `StoryboardWorkspace`
- `AssetsWorkspace`

### 建议过渡
进入：
- opacity: 0 → 1
- translateY: 6px → 0
- scale: 0.992 → 1

离开：
- opacity: 1 → 0
- scale: 1 → 0.992

### 注意
不要让四个 workspace 同时做复杂 layout 动画，容易卡。

---

## 7. Canvas 侧动效规划

## 7.1 PromptDock
当前已经有基础动效，[styles.css:171-200](styles.css#L171-L200)。

### P4 建议
- 保留现有浮入方向
- 把 duration/easing 改为 motion token
- 把 hover lift 收口为统一值
- 给 DiagnosticBar 和 PromptBar 的层级反馈更明确

---

## 7.2 画布元素选中反馈
当前选中主要是边框和 handle，[App.tsx:2424-2438](App.tsx#L2424-L2438)。

### P4 建议
- 选中时外框有轻微 alpha pulse（很轻）
- handle hover 有 scale-up
- 多选框选完成时有一个轻微 settle 动作

### 注意
这个动画一定要轻，不然画布会显得抖。

---

## 7.3 元素工具条（ElementToolbar）
当前 toolbar 本身已经是浮层，但视觉反馈偏“静态工具条”。

### P4 建议
- toolbar 出现时轻微上浮 + fade
- icon hover 有统一 hover lift
- 视频工具组 / 图片工具组切换时保持同一手感

---

## 8. Workflow 动效规划

这是 P4 最重要的一块。

## 8.1 节点卡片状态动效
建议针对节点状态：

### idle
- 静态
- 微弱阴影

### hover
- 轻微 lift
- 阴影略增强
- 边框对比提升

### drag
- scale 1.01
- 阴影增强
- 不透明度略升

### running
- 顶部状态点 pulsing
- 节点边框出现轻微流光
- 节点内部某个 corner 有活跃 indicator

### success
- 边框/状态点短暂绿色 pulse 一次
- 如果有输出预览，预览缩略图轻微 fade-in

### error
- 红色状态点 + 轻微 shake（只一次）
- Inspector 自动滚到错误说明

---

## 8.2 边（Edge）执行动效
这个会决定“节点是不是活的”。

### 建议效果
- idle：细线、低对比
- hover：线稍亮
- connected active path：更亮
- running：一段高亮沿着线移动
- success：终点端轻 pulse
- error：线条变红并短暂闪断

### 技术建议
P4 先用：
- SVG stroke-dashoffset
- opacity animation
- 伪元素 / gradient mask

不要一上来做复杂粒子系统。

---

## 8.3 Minimap
当前 minimap 已有计算逻辑，[components/NodeWorkflowPanel.tsx:368-408](components/NodeWorkflowPanel.tsx#L368-L408)。

### P4 建议
- 视口框拖动时有更柔和跟手感
- 当前活动节点在 minimap 上短暂闪亮
- 选中节点在 minimap 上高亮而非只普通块

---

## 9. Storyboard 动效规划

## 9.1 Shot Card
P3 会新增 shot rail 和 card。

### 建议效果
- hover：上浮 + shadow 增强
- active：边框高亮 + 胶囊底色
- running：状态点 pulsing
- done：主缩略图淡入
- error：红点 + 微 shake

### 特别重要
Shot card 不能做成 admin list，要像“创作卡”。
动效应该强化“镜头是一个有生命的创作单元”。

---

## 9.2 输出回填动效
当一个 shot 生成完成并回填 output 时：
- 新 output 卡片从下向上 fade-in
- 主输出切换时旧图轻 fade-out，新图 fade-in
- 如果从 Workflow 回填 Shot，建议显示一条短暂 success toast / badge

---

## 10. Assets / Output 回填动效

这个是创作工具里最容易被忽视，但非常值钱的体验点。

## 场景
- Workflow 输出保存到 Assets
- Storyboard 输出保存到 Canvas
- 历史图拖回画布

### 建议反馈
不要做大飞行动画，但要有可感知反馈：
- 目标区高亮一瞬
- 新卡片出现时淡入
- 角标显示 “Saved” / “Sent to Canvas” / “Attached to Shot”

### 原则
用户不一定需要看到“飞过去”，但一定要知道“到了”。

---

## 11. 推荐文件结构（P4）

建议新增：

```text
styles/
  motion.css

utils/
  motionTokens.ts
  useReducedMotion.ts

components/motion/
  MotionFade.tsx
  MotionScaleIn.tsx
  MotionStatusDot.tsx
  MotionHighlightRing.tsx
  EdgeRunPulse.tsx
```

### 修改文件

```text
styles.css
App.tsx
components/TopWorkspaceBar.tsx
components/RightPanel.tsx
components/Toolbar.tsx
components/NodeWorkflowPanel.tsx
components/workspaces/WorkflowWorkspace.tsx
components/workspaces/StoryboardWorkspace.tsx
components/workspaces/AssetsWorkspace.tsx
components/ElementToolbar.tsx
```

---

## 12. 是否引入 Framer Motion

## 12.1 当前状态
[package.json](package.json) 里没有 `framer-motion`。

### 所以 P4 有两个方案

#### 方案 A：继续走 CSS + 轻 JS
适合：
- 节制
- 成本低
- 性能可控
- 容易接你现有结构

#### 方案 B：引入 `framer-motion`
适合：
- 顶栏切页共享动画
- 卡片进入/退出
- 更自然的 spring

### 我的建议
**P4 可以引入 framer-motion，但只在产品壳层和卡片层使用，不要直接侵入 SVG 画布热路径。**

也就是说：
- TopWorkspaceBar：可以用
- Workspace 过渡：可以用
- ShotCard / AssetCard：可以用
- Node editor 主画布拖拽热路径：尽量别用

---

## 13. `prefers-reduced-motion` 规范
当前 [styles.css:203-211](styles.css#L203-L211) 已经有 reduced motion 基础。

### P4 要求
新加的所有：
- keyframes
- hover transform
- edge pulse
- view transition
都必须遵守 reduced motion。

### 原则
用户关闭动画后：
- 功能仍成立
- 状态仍可理解
- 只是少了运动，不少信息

---

## 14. 实施顺序建议

### Step 1：先建立 motion token
- `motion.css`
- `motionTokens.ts`
- 把现有散落的 duration/easing 开始收口

### Step 2：做产品壳层动效
- TopWorkspaceBar
- workspace 切页
- 右侧 panel 统一开合手感

### Step 3：做 Workflow 状态动效
- 节点 hover/drag/run/success/error
- edge run pulse
- inspector 输出淡入

### Step 4：做 Storyboard/Assets 状态动效
- Shot card
- output attach
- asset save feedback

### Step 5：最后统一微交互
- buttons
- tabs
- popovers
- toolbar

---

## 15. 验证标准

P4 做完后，至少应满足：

1. 顶栏切页不再是生硬跳切
2. Workflow 节点运行状态一眼能看懂
3. Storyboard 镜头卡有明确生命状态
4. Assets / Output 回填有可感知反馈
5. 所有动效手感统一，没有“这里快那里拖”的割裂感
6. reduced motion 下仍可用

---

## 16. 风险点

### 风险 1：动画太多，反而显廉价
解决：
- 所有动画必须服务于状态理解
- 优先小幅度、短时长、轻弹性

### 风险 2：把 motion library 用进热路径
解决：
- 画布拖拽 / 节点热更新保持原生/轻量
- motion library 只用于壳层和卡片层

### 风险 3：不同模块各自定义动画，继续失控
解决：
- 先收 token，再收表现

---

## 17. 最后的建议

P4 的关键不是“让界面更花”，而是：

> **让用户觉得这个系统是活的、懂反馈的、专业但不机械。**

你真正需要的不是更多动画，而是：
- 切换有连续性
- 运行有过程感
- 结果有到达感
- 卡片/节点/面板都像同一个产品说一种语言

这才是高级感的来源。

---

## 18. 推荐的下一个规划主题

如果 P4 完成，后面最自然的 P5 是：

### P5：Provider / Model Template System
重点做：
- 每节点模型模板
- provider capability matrix
- 参数 schema 化
- 统一模型配置与模板导入导出

因为等 P1~P4 打完之后，你的产品就会开始进入“真正的多 provider 创作平台”阶段。