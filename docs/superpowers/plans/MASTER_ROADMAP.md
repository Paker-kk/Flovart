# Flovart Master Roadmap

> 本文汇总 P0–P8 + 浏览器扩展/桌面生态规划，作为产品演进的单一索引文档。
> 每一阶段对应 `docs/superpowers/plans/` 下的独立详细方案。

---

## 全局状态总览

| Phase | 名称 | 状态 | 详细方案 |
|-------|------|------|----------|
| **P0** | AIGC Canvas 稳定性 & Provider 修复 | ✅ 完成 | [2026-04-19-aigc-canvas-remediation.md](2026-04-19-aigc-canvas-remediation.md) |
| **P1** | Tapnow-Style App Shell + 顶栏导航 | ✅ 完成 | [2026-04-20-tapnow-app-shell-phase1.md](2026-04-20-tapnow-app-shell-phase1.md) |
| **P2** | Workflow 产品化 | 🟡 实施中（Slice 2） | [2026-04-20-workflow-productization-phase2.md](2026-04-20-workflow-productization-phase2.md) |
| **P3** | Storyboard + VideoEdit MVP | 📋 规划完成 | [2026-04-20-storyboard-videoedit-phase3.md](2026-04-20-storyboard-videoedit-phase3.md) |
| **P4** | Motion + Interaction Polish | 📋 规划完成 | [2026-04-20-motion-interaction-phase4.md](2026-04-20-motion-interaction-phase4.md) |
| **P5** | Provider + Model Template System | 📋 规划完成 | [2026-04-20-provider-model-template-phase5.md](2026-04-20-provider-model-template-phase5.md) |
| **P6** | Execution Trace + Observability | 📋 规划完成 | [2026-04-20-execution-trace-observability-phase6.md](2026-04-20-execution-trace-observability-phase6.md) |
| **P7** | Claude / Agent / Skill 原生集成 | 📋 规划完成 | [2026-04-20-claude-agent-skill-integration-phase7.md](2026-04-20-claude-agent-skill-integration-phase7.md) |
| **P8** | Collaboration + Publishing Pipeline | 📋 规划完成 | [2026-04-20-collaboration-publishing-phase8.md](2026-04-20-collaboration-publishing-phase8.md) |
| **Eco** | Browser Extension ↔ Desktop 生态 | 📋 规划完成 | [2026-04-20-browser-extension-desktop-ecosystem.md](2026-04-20-browser-extension-desktop-ecosystem.md) |

---

## P0 — AIGC Canvas 稳定性 & Provider 修复 ✅

**目标**：稳定大图/视频工作负载，修正 provider/key 行为，消除高摩擦 bug。

**已完成交付物**（8/8 任务 + 4 项 UX 增强）：

- 测试基础设施（jsdom、WebCrypto polyfill、URL mock）
- Extension key codec（`utils/keyCodec.ts`）
- Video URL 生命周期管理（`utils/objectUrlRegistry.ts`）
- 有界历史记录（`utils/historyState.ts`，MAX=50）
- RAF 批处理 + snap 缓存（`utils/rafBatcher.ts`）
- 视频持久化（`utils/mediaDB.ts`，IndexedDB）
- 能力诊断（`explainKeyCapabilities()`）
- Agent/Banana 语义修正
- Toast 通知系统（`hooks/useToast.ts` + `components/Toast.tsx`）
- 社交平台比例预设（`utils/socialPresets.ts`）
- Provider→比例门控（`PROVIDER_VIDEO_RATIOS` + UI disabled 状态）
- 动态 MAX_DIM（`getResponsiveMaxDim()`，1080–2160）

**测试**：84 tests（83 pass, 1 skip），13 test files

---

## P1 — Tapnow-Style App Shell + 顶栏导航 ✅

**目标**：搭建产品壳（App Shell + Top Bar），把页面拆成 Canvas / Workflow / Storyboard / Assets 四个工作区。

**已完成交付物**：
- Zustand 5.0 Store（`stores/useWorkspaceStore.ts`）— UISlice: activeView, themeMode, language + persist
- `<AppShell>` 组件 — 统一壳层（topBar / leftSidebar / main / rightSidebar / overlays）
- `<TopWorkspaceBar>` — 4 工作区 tab 切换 + Settings
- 4 个 Workspace 组件（CanvasWorkspace / WorkflowWorkspace / StoryboardWorkspace / AssetsWorkspace）
- App.tsx 重构 — 使用 AppShell 包裹; themeMode/language/activeView 迁移到 Zustand
- `WorkspaceView` 类型（types.ts）

**测试**：83 pass, 1 skip | 506KB gzip 162KB

---

## P2 — Workflow 产品化

**目标**：把 Workflow 从"可运行原型"升级为"正式产品工作区"。

**关键交付物**：
- Node Library / Template Library（左侧）
- Node Inspector（右侧配置面板）
- 每节点可配置 provider / model / params / timeout / retry / key
- 节点执行状态可视化（idle → queued → running → success/error）
- 数据传递规则统一

**当前状态**：
- Slice 1 已落地结构化 `WorkflowValue` 输出与真实运行接线
- Slice 2 已落地 `Execute Node` / `Execute From Here` 与最小 `Pin Output`
- Workflow 节点已具备最小运行态和最小 Inspector 调参与调试能力
- 输出已可通过 `preview` / `saveToCanvas` 回填白板
- 下一轮待锁定：API Key 优先级、Starter Flow、schema-driven Inspector

**前置**：P1

---

## P3 — Storyboard + VideoEdit MVP

**目标**：最小可行的镜头组织 + 轻量视频编辑。

**关键交付物**：
- Storyboard Workspace（Shot 卡片组织层）
- Shot 绑定 prompt / 参考图 / 参考视频 / 时长 / 比例
- 视频最小编辑：trim / extend / variation / 替换关键帧
- Shot → Workflow / Canvas 一键生成
- 输出回填到 Canvas / Assets / Storyboard

**前置**：P1 + P2

---

## P4 — Motion + Interaction Polish

**目标**：统一动效语言，从工具感升级为创作系统感。

**关键交付物**：
- 统一 motion system（duration / easing / elevation / scale tokens）
- 工作区切换过渡动效
- Workflow 节点 hover / drag / run 动效
- Storyboard Shot 状态反馈
- `prefers-reduced-motion` 支持

**前置**：P1 + P3

---

## P5 — Provider + Model Template System

**目标**：建立统一的 Provider Registry + Model Template。

**关键交付物**：
- 统一 Provider Registry 数据结构
- Model Template Schema（每 template 声明 capability / params / defaults）
- Node Inspector 根据 template 自动渲染参数表单
- 模板导入 / 导出
- Provider capability matrix

**前置**：P2

---

## P6 — Execution Trace + Observability

**目标**：统一的运行可观测性、任务追踪、调试面板。

**关键交付物**：
- Runtime Session 概念
- Command / Job / Trace 统一数据结构
- 全链路可追踪（Web 白板、Workflow、Storyboard、Extension）
- API Key 共享语义可观测
- 开发 / 诊断 / trace 面板

**前置**：P2 + Extension 桥接

---

## P7 — Claude / Agent / Skill 原生集成

**目标**：让 Claude Code / Flovart Skill / Agent 与白板形成原生操作层。

**关键交付物**：
- 统一 Action DSL / 动作协议
- Claude 稳定操作：查询画布、创建/修改元素、触发生成、调 workflow、更新 shot
- Skill ↔ Runtime API 统一 session
- 可追踪 trace（与 P6 打通）

**前置**：P6 + Flovart Skill

---

## P8 — Collaboration + Publishing Pipeline

**目标**：从个人创作到可协作、可审阅、可发布。

**关键交付物**：
- Project / Workflow / Storyboard 协作对象
- 审阅流（shot outputs → best candidate / reject / needs revision）
- 导出流（canvas selection / storyboard sequence / workflow output set）
- 发布流（ffmpeg / remotion / capcut / social post package）
- 最小协作状态流

**前置**：P3 + P7

---

## Eco — Browser Extension ↔ Desktop 生态

**目标**：建立三端（Extension ↔ Web ↔ Desktop EXE）产品分工与桥接协议。

**三端定位**：
- **Extension**：采集端 + 浏览器上下文入口 + 快速注入
- **Web**：轻量入口 / 在线工作台
- **Desktop EXE（Tauri）**：本地主控端 / 重度工作端 / 导出与代理端

**关键交付物**：
- 三端共享状态模型（API Key / project / session）
- 统一桥接协议（Extension ↔ Web ↔ Desktop）
- Desktop 专属能力（本地 GPU 代理、文件系统、FFmpeg pipeline）
- Extension 专属能力（网页采集、右键菜单、反推 prompt 注入）

**贯穿所有阶段**，每个 Phase 实现后都应更新三端联动点。

---

## 依赖关系图

```
P0 (Done)
 └─▶ P1 (App Shell)
      ├─▶ P2 (Workflow)
      │    ├─▶ P5 (Provider Templates)
      │    └─▶ P6 (Observability)
      │         └─▶ P7 (Agent Integration)
      │              └─▶ P8 (Collaboration)
      └─▶ P3 (Storyboard + VideoEdit)
           └─▶ P4 (Motion Polish)

Eco (浏览器/桌面生态) ── 贯穿所有阶段
```

---

## 当前技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 19.1.1 + TypeScript 5.8.2 |
| 构建 | Vite 6.3.6 + Tailwind CSS 4.2.2 |
| 测试 | Vitest 4.1.0 (84 tests) |
| 桌面 | Tauri 2.10 |
| 扩展 | Chrome Extension MV3 |
| AI 提供商 | 15 providers（Google/OpenAI/Anthropic/DeepSeek/Qwen/MiniMax/Keling/Flux/MJ/RunningHub/SiliconFlow/Volcengine/OpenRouter/Banana/Custom） |
| 编辑器 | TipTap 3.20 (Rich Prompt Editor) |
| 存储 | IndexedDB (mediaDB, imageDB) + chrome.storage + localStorage |

---

*最后更新：2026-04-21 — P0、P1 已完成；P2 已进入 Slice 2 实施，当前已落地结构化输出、真实执行接线、局部执行、最小 Pin Output、最小 Inspector 与白板回填；下一轮聚焦 Starter Flow、API Key 优先级与 schema-driven Inspector。*
