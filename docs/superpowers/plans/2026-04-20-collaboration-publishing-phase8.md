# Collaboration + Publishing Pipeline Phase 8 Plan

> 目标：在 P1~P7 完成后，把 Flovart 从“个人创作工作台”进一步扩展成“可协作、可审阅、可导出、可发布”的创作平台，补齐从白板/Workflow/Storyboard 产出到最终媒体导出、发布分发的完整 pipeline。
>
> 本阶段只做规划，不写代码。

---

## 0. 先说结论

你现在已经有不少“发布前”的原始能力，但它们还是分散的：

### 已有基础
1. **可导出画布数据**
   - `export-canvas-data.js` 可以导出 canvas JSON，见 [skills/flovart/scripts/export-canvas-data.js](skills/flovart/scripts/export-canvas-data.js)

2. **可导出 FFmpeg 兼容格式**
   - `export-to-ffmpeg.js` 能导出 concat/script，见 [skills/flovart/scripts/export-to-ffmpeg.js](skills/flovart/scripts/export-to-ffmpeg.js)

3. **已有外部内容导入脚本**
   - `import-from-libtv.js`
   - `import-from-runninghub.js`
   - 说明白板已经能作为创作汇聚中心

4. **Flovart skill 文档中已经定义了与 FFmpeg / Remotion / 发布工具的协作方向**
   - 见 [skills/flovart/SKILL.md:641-661](skills/flovart/SKILL.md#L641-L661)

### 现在的问题
这些能力现在更像：
- 一些对开发者友好的脚本和手工步骤

而不是：
- 一条产品化的协作-审阅-导出-发布流水线

所以 P8 的核心目标不是“再加几个 export 按钮”，而是：

> **建立从创作、审阅、选片、导出、发布的完整 Pipeline。**

---

## 1. P8 的目标边界

P8 完成后，产品应该具备：

1. 有协作对象：
   - project
   - workflow
   - storyboard
   - output candidates
2. 有审阅对象：
   - shot outputs
   - best candidate / reject / needs revision
3. 有导出对象：
   - canvas selection
   - storyboard sequence
   - workflow output set
4. 有发布对象：
   - ffmpeg/remotion/capcut/export bundle
   - social post package
5. 有最小的协作状态流：
   - draft
   - in review
   - approved
   - exported
   - published

### 本阶段不做
- 真正的多人实时协同编辑
- 云端评论系统
- SaaS 级权限系统
- 真正的社媒 API 大规模集成

---

## 2. 当前系统现状诊断

## 2.1 现在的导出能力是脚本级，不是产品级
### `export-to-ffmpeg.js`
[skills/flovart/scripts/export-to-ffmpeg.js](skills/flovart/scripts/export-to-ffmpeg.js)

它当前能做：
- 拉取当前 canvas elements
- 过滤 image/video
- 按 x 位置排序
- 导出 concat/script/JSON

### 但它的问题是
- 时间顺序靠 `x` 坐标，不是真正 timeline 语义
- 文件名仍然偏占位符
- 没有 shot/project 元数据
- 没有导出 profile（横版短视频 / 竖版短视频 / storyboard animatic）

### 结论
它是很好用的底层脚本，但不是最终导出产品层。

---

## 2.2 `export-canvas-data.js` 是通用交换格式雏形
[skills/flovart/scripts/export-canvas-data.js](skills/flovart/scripts/export-canvas-data.js)

当前能导出：
- elements
- canvas zoom/pan
- providers

### 说明
这是很好的跨 skill / 跨工具交换基础。

### 但问题
它还缺：
- storyboard 数据
- workflow 数据
- asset refs
- output refs
- template refs
- trace refs

### 结论
P8 应该把它升级成“项目级导出包”，而不只是 canvas dump。

---

## 2.3 现在没有“协作/审阅流”概念
当前系统里基本还是：
- 个人生成
- 个人挑选
- 个人导出

缺少：
- 候选结果集合
- 选优/淘汰
- shot 级 review
- 导出前审批状态

### 结论
P8 要先补一个最小 review model，而不是直接谈多人协作。

---

## 3. P8 的总体结构

建议引入四层：

```text
Project Layer
   ↓
Review / Approval Layer
   ↓
Export Layer
   ↓
Publishing Layer
```

### Project Layer
负责：
- project
- storyboard
- workflow
- asset ownership

### Review / Approval Layer
负责：
- output candidate 管理
- 审核状态
- best pick / reject

### Export Layer
负责：
- ffmpeg bundle
- remotion bundle
- capcut exchange
- json bundle

### Publishing Layer
负责：
- 生成发布素材包
- 导出 caption/package metadata
- 连接发布 skill

---

## 4. 推荐新增的数据模型

建议新增 `types/collaboration.ts`：

```ts
export type ReviewStatus = 'draft' | 'in_review' | 'approved' | 'rejected' | 'exported' | 'published';

export interface OutputCandidate {
  id: string;
  shotId?: string | null;
  elementId?: string | null;
  mediaType: 'image' | 'video';
  prompt?: string;
  provider?: string;
  model?: string;
  createdAt: number;
  status: ReviewStatus;
  reviewNotes?: string;
  score?: number;
  selected?: boolean;
}

export interface CreativeProject {
  id: string;
  name: string;
  storyboardId?: string | null;
  workflowIds?: string[];
  assetIds?: string[];
  outputCandidateIds?: string[];
  status: ReviewStatus;
  createdAt: number;
  updatedAt: number;
}

export interface ExportPreset {
  id: string;
  label: string;
  target: 'ffmpeg' | 'remotion' | 'capcut' | 'json' | 'social';
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9';
  fps?: number;
  resolution?: string;
  includeAudio?: boolean;
}
```

### 为什么要这层
因为你要解决的不再是“如何导出一个元素”，而是：
- 哪个项目导出
- 哪些镜头入选
- 当前导出到了哪个阶段
- 是否已经发布

---

## 5. 协作层（Collaboration）规划

## 5.1 先做“项目协作语义”，不做实时多人同步
建议新增：

```text
components/project/
  ProjectSwitcher.tsx
  ProjectOverviewPanel.tsx
  ProjectStatusBadge.tsx
```

### 作用
- 用户至少要能知道自己当前在处理哪个 project
- project 下有哪些 storyboard / workflow / outputs
- 当前项目状态是：draft / review / approved / exported / published

### 为什么重要
因为没有 project 语义，后面的 review 和 publishing 都会变成散乱文件。

---

## 5.2 Review / Approval MVP
建议新增：

```text
components/review/
  OutputReviewPanel.tsx
  CandidateCard.tsx
  ReviewActionBar.tsx
```

### 功能
- 查看某个 shot 的所有 candidate
- 标记 best / reject / keep
- 填写 review note
- 一键“选为主输出”

### 为什么这是协作的第一步
比起直接做评论系统，更实际的是先让“审阅流”存在。

---

## 6. 导出层（Export Layer）规划

## 6.1 新增 Export Center
建议新增：

```text
components/export/
  ExportCenter.tsx
  ExportPresetPicker.tsx
  ExportJobPanel.tsx
  ExportBundleSummary.tsx
```

### Export Center 负责
- 选择导出源：canvas / storyboard / workflow outputs
- 选择 preset
- 生成 bundle
- 显示导出 job 状态

---

## 6.2 FFmpeg 导出升级方向
当前 `export-to-ffmpeg.js` 应该升级成两层：

### 底层
保留脚本：
- 继续支持 concat/script 生成

### 产品层
新增更高层：
- 以 storyboard shot 顺序导出
- 支持 duration/fps/aspect preset
- 支持 clip 级元数据

### 这样做的好处
脚本仍能继续为技能生态服务，但用户层能真正感知“导出影片”。

---

## 6.3 Remotion / CapCut 导出方向
因为 skill 文档里已经提到了 Remotion / CapCut 协作方向，[skills/flovart/SKILL.md:575-578](skills/flovart/SKILL.md#L575-L578)

### P8 不要求完整实现
但应该在架构上为它们预留统一出口：

```text
export.remotionBundle
export.capcutExchange
export.socialPackage
```

### 含义
- Remotion：导出带 timeline/asset refs 的 JS/JSON bundle
- CapCut：导出可消费的 clip/package metadata
- Social：导出图片/视频 + caption + tags 包

---

## 7. Publishing Layer 规划

建议新增：

```text
components/publish/
  PublishPanel.tsx
  PublishTargetPicker.tsx
  SocialPackagePreview.tsx
```

### 不是直接发内容
P8 第一版建议只做：
- 发布包生成
- 文案包生成
- 媒体包生成
- 元数据包生成

也就是：
> 先导出可发布 package，不一定直接发平台。

### 为什么
因为真正直连平台 API：
- 复杂
- 权限多
- 很快把项目拖进另一个坑

---

## 8. 与现有白板 / Workflow / Storyboard 的联动

## 8.1 Canvas → Review
- 用户在 Canvas 里生成多个结果
- 这些结果进入 candidate 集合
- 可标记为某个 shot 的候选输出

## 8.2 Workflow → Review
- workflow node 输出不再只是孤立结果
- 可直接登记为 `OutputCandidate`

## 8.3 Storyboard → Export
- 用户在 Storyboard 里选好每个 shot 的主输出
- Export Center 读取 shot sequence
- 输出 ffmpeg/remotion/capcut bundle

### 这样形成闭环
```text
Canvas / Workflow
   ↓
Candidate Review
   ↓
Storyboard Selection
   ↓
Export Preset
   ↓
Publishing Package
```

---

## 9. 白板与插件的协作补充

你之前要求补插件联动，这里 P8 再往前走一步：

## 9.1 插件可参与“采集”而不只是“调用”
现在插件已经可以：
- 添加图片到画布
- 反推 prompt

P8 可以继续扩展为：
- 把网页素材标记为某个 project/shot 的参考素材
- 把外部网页视频加入 storyboard refs
- 把插件采集内容直接送入 Assets Workspace

### 建议新增动作
```text
assets.captureFromExtension
storyboard.attachReferenceFromExtension
project.ingestExternalMedia
```

---

## 9.2 插件和白板共享导出上下文
例如：
- 插件里点“发送到 Flovart 项目”
- 白板能知道当前 active project / active shot
- 插件导入结果不是只放画布，而能直接挂到 storyboard / assets

### 这会让插件从“入口工具”升级成“采集端”。

---

## 10. 推荐新增文件结构

### 新增

```text
types/collaboration.ts
utils/projectStore.ts
utils/reviewStore.ts
components/project/ProjectSwitcher.tsx
components/project/ProjectOverviewPanel.tsx
components/review/OutputReviewPanel.tsx
components/review/CandidateCard.tsx
components/export/ExportCenter.tsx
components/export/ExportPresetPicker.tsx
components/export/ExportJobPanel.tsx
components/publish/PublishPanel.tsx
components/publish/SocialPackagePreview.tsx
```

### 修改

```text
App.tsx
components/workspaces/AssetsWorkspace.tsx
components/workspaces/StoryboardWorkspace.tsx
components/RightPanel.tsx
skills/flovart/scripts/export-to-ffmpeg.js
skills/flovart/scripts/export-canvas-data.js
skills/flovart/SKILL.md
```

---

## 11. 推荐实施顺序

### Step 1：先补 Project + Candidate 数据模型
这样 review/export 才有依托。

### Step 2：做 Review MVP
让 output 有“选优/淘汰/主输出”能力。

### Step 3：做 Export Center
把现有脚本封成产品层入口。

### Step 4：做 Storyboard → Export 闭环
让镜头序列真正能导出。

### Step 5：做 Publishing Package
输出给 ffmpeg/remotion/capcut/social skill 使用。

### Step 6：扩展插件采集语义
把插件拉进 project/storyboard/assets 链路。

---

## 12. 验证标准

P8 做完后，至少应满足：

1. 用户可以把结果组织进 project
2. 每个 shot 有 candidate review 机制
3. 可选“最佳输出”
4. Export Center 可以从 storyboard/canvas/workflow 导出 bundle
5. 插件采集结果能进入 project/assets/storyboard，而不只是临时放画布
6. 输出可以形成“可发布包”，而不是只是一堆散文件

---

## 13. 风险点

### 风险 1：导出层过早做成“完整后期系统”
解决：
- 先输出结构化 bundle
- 不急着做所有 renderer

### 风险 2：review 层做得太轻，最终没人用
解决：
- 至少有 best/reject/note/approved 这四个动作

### 风险 3：project 语义过晚引入，导致状态散乱
解决：
- P8 一开始就先立 project model

---

## 14. 最后的建议

P8 的关键不是“发到哪里”，而是：

> **把创作结果从单个生成物，升级成可被组织、筛选、导出、交付的项目产物。**

这一步做完，你的产品就真正开始具备平台交付能力。

---

## 15. 推荐的下一个规划主题

如果你还想继续补完整路线，P9 最自然的是：

### P9：Multi-user Collaboration + Review Workflow
重点做：
- 评论
- 分配
- 审批流
- 共享项目空间
- 版本对比

这样就会从“个人 AI 创作系统”升级成“团队创作平台”。