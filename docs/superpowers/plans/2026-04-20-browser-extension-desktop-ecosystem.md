# Browser Extension ↔ Desktop EXE Ecosystem & Linkage Plan

> 目标：规划 Flovart 的 **浏览器插件（Chrome Extension）— Web 白板 — 桌面 EXE（Tauri）** 三端生态与联动关系，让它们不再是三个平行入口，而是一个统一创作系统中的不同端。
>
> 本文只做规划，不写代码。

---

## 0. 先说结论

你现在已经有三端雏形，但生态关系还没有真正成型：

### 当前已有
1. **浏览器插件**
   - 有 popup、background、content script
   - 能做右键采集、反推 prompt、向白板发命令
   - 能通过 `chrome.storage.local` 保存和共享 API Key

2. **Web 白板**
   - 是当前能力最完整的主端
   - 暴露 `window.__flovartAPI`
   - 已经能承接插件命令和脚本命令

3. **桌面 EXE（Tauri）**
   - 目前是把 Web 前端包了一层桌面壳
   - 有 updater，但几乎没有桌面专属能力
   - 还没有成为生态中的一等节点

### 当前问题
现在这三端关系更像：
- Extension：一个浏览器辅助工具
- Web：主应用
- EXE：打包版 Web

而不是：
- **Extension = 采集端 / 浏览器协作端**
- **Web = 轻量入口 / 在线工作台端**
- **Desktop EXE = 本地主控端 / 重度工作端 / 导出与代理端**

所以这份规划的核心目标不是“让 EXE 和插件能互相打开”，而是：

> **建立 Browser Extension ↔ Web ↔ Desktop EXE 的三端产品分工、共享状态模型、桥接协议和能力边界。**

---

## 1. 三端产品定位建议

## 1.1 浏览器插件（Extension）
建议定位为：

> **采集端 + 浏览器上下文入口 + 快速注入端**

### 它最适合做的事
- 在网页里右键采集图片/视频/文本
- 反推 prompt
- 一键送到当前 Flovart project / shot / canvas
- 调用白板 runtime API 做轻操作
- 读取共享 API Key 状态（非明文暴露）

### 它不适合做的事
- 完整创作主界面
- 重度 workflow 操作
- 大量导出 / 本地编排 / 本地渲染

---

## 1.2 Web 白板
建议定位为：

> **轻量主入口 + 在线工作台 + 跨端统一 UI 主体**

### 它最适合做的事
- 轻量画布创作
- PromptBar / AI 生成
- Workflow / Storyboard / Assets / Review
- 统一产品体验
- 和扩展、Claude、skill 的运行时桥接

### 它不适合做的事
- 高强度本地文件管理
- 大规模本地缓存编排
- 本地代理/渲染/重导出管线

---

## 1.3 Desktop EXE（Tauri）
建议定位为：

> **本地主控端 + 重度工作端 + 文件/导出/代理/伴随服务端**

### 它最适合做的事
- 本地项目管理
- 本地文件落盘与导出中心
- 本地缓存、媒体中转
- FFmpeg / Remotion / CapCut / 本地代理的统一主入口
- 未来作为浏览器插件的 companion app

### 当前问题
从现状看：
- `src-tauri` 目前只有最薄的一层 Tauri 壳，见 [src-tauri/src/lib.rs](src-tauri/src/lib.rs) 和 [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json)
- 前端几乎没有使用 `@tauri-apps/api` 的痕迹

### 结论
现在桌面端还不能叫“桌面生态节点”，只能叫“桌面包装形态”。

---

## 2. 当前代码现状诊断

## 2.1 浏览器插件已经是最成熟的“侧入口”
当前 extension 已具备：
- 右键菜单，[extension/background/service-worker.js:3-29](extension/background/service-worker.js#L3-L29)
- 网页采图到白板，[extension/background/service-worker.js:39-60](extension/background/service-worker.js#L39-L60)
- 反推 prompt，[extension/background/service-worker.js:66-79](extension/background/service-worker.js#L66-L79)
- runtime bridge，[extension/background/service-worker.js:112-151](extension/background/service-worker.js#L112-L151)
- content 侧转发，[extension/content/content.js:7-21](extension/content/content.js#L7-L21)

### 说明
Extension 已经不只是“设置页”，而是一个很好的 browser capture layer。

---

## 2.2 Web 端已经能承接插件状态
当前 [App.tsx](App.tsx) 已经会读取：
- `flovart_pending_image`
- `flovart_pending_prompt`
- `flovart_collected_images`

见 [App.tsx:1033-1066](App.tsx#L1033-L1066)

### 说明
Web 已经承担了“接收插件输入”的主应用角色。

### 但问题
这种联动更像：
- 若干共享 storage key + 启动时捞取

而不是：
- 统一 session / project / shot / asset ingestion 协议

---

## 2.3 桌面端目前没有参与三端协作
当前 Tauri 配置里只有：
- app window
- updater
- opener plugin

见 [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json) 和 [src-tauri/Cargo.toml](src-tauri/Cargo.toml)

### 缺失
没有：
- 自定义 `invoke` command
- 本地 companion service
- 与浏览器插件的协作通道
- 本地导出服务
- 深链接/协议唤起
- 项目文件系统语义

### 结论
EXE 的真正价值还没释放出来。

---

## 3. 三端生态的正确关系

建议定义成：

```text
Browser Extension = Capture Edge
Web App           = Universal Creative UI
Desktop EXE       = Local Power Hub
```

### 关系图

```text
[Browser Extension]
   ├─ capture media / prompt / page context
   ├─ send lightweight commands
   └─ bridge into current project/session
            ↓
[Web App Runtime]
   ├─ canvas/workflow/storyboard/assets UI
   ├─ runtime API / trace / session
   └─ cloud-friendly / browser-friendly main app
            ↓
[Desktop EXE / Companion]
   ├─ local file storage
   ├─ export/render/transcode
   ├─ project workspace manager
   └─ native helper for extension/web
```

---

## 4. P0 级生态设计原则

## 4.1 三端共享“项目语义”，不要只共享零散状态
现在共享的主要是：
- API Key
- pending image
- pending prompt

未来应该共享：
- activeProjectId
- activeShotId
- activeSessionId
- activeModelContext
- lastOutputRefs

### 这比只共享 storage key 更重要。

---

## 4.2 插件和 EXE 不应该直接抢 Web 的主角色
最正确的模式是：
- Web 仍然是统一 UI
- Extension 负责采集和浏览器上下文
- EXE 负责重任务、本地文件、导出与伴随服务

### 否则会出现
- 三套 UI
- 三套项目状态
- 三套用户习惯

---

## 5. 推荐的阶段性生态规划

## Phase A：统一三端状态语义
新增统一概念：
- `ProjectContext`
- `SessionContext`
- `BridgeContext`

建议新增：

```text
types/ecosystem.ts
services/contextBridge.ts
services/environmentResolver.ts
```

### `ProjectContext`
```ts
export interface ProjectContext {
  projectId?: string | null;
  shotId?: string | null;
  sessionId?: string | null;
  source: 'web' | 'extension' | 'desktop';
  activeProvider?: string;
  activeModel?: string;
}
```

### 为什么要先做这层
因为以后：
- 插件采到图片
- EXE 导出 bundle
- Web 运行 workflow
都必须知道“当前在谁的项目上下文里”。

---

## Phase B：定义 Extension ↔ Web ↔ EXE Companion 协议

建议定义三类桥：

### 1. Storage Bridge
现在已有基础：
- `chrome.storage.local`
- Web 读取/同步 key

未来扩展为：
- key sync status
- active project context sync
- last output refs sync

### 2. Runtime Bridge
现在已有基础：
- `FLOVART_COMMAND` → `window.__flovartAPI`

未来扩展为：
- 统一 envelope
- traceId/sessionId
- target domain
- output refs

### 3. Desktop Companion Bridge
这是目前缺失的。

建议未来 EXE 提供本地 companion 服务：
- localhost loopback
- 或自定义 protocol / deeplink
- 或 Tauri sidecar / local service

用于承担：
- 文件导出
- 本地代理
- 转码
- 本地缓存同步
- 插件唤起 EXE

---

## 6. 浏览器插件的未来角色升级

## 6.1 从“采集小工具”升级为“Browser Capture Node”
建议插件新增几类动作：

```text
capture.toProject
capture.toShot
capture.toAssets
capture.toWorkflowInput
capture.toCanvasSelection
```

### 说明
这样插件就不是只做：
- 添加到画布

而是能做：
- 添加到某个项目
- 添加到某个镜头
- 添加到资产库
- 添加到 workflow 输入

这会让插件真正成为生态的一端。

---

## 6.2 插件侧项目上下文感知
插件应知道：
- 当前是否有 Flovart session
- 当前 active project / shot 是什么
- 如果有多个打开的 Flovart 实例，命令要送到哪个目标

### 建议新增状态卡
- 当前连接：Web / Desktop / None
- 当前项目名
- 当前镜头名
- 当前共享 key 状态

---

## 7. Desktop EXE 的正确升级方向

## 7.1 从“打包版 Web”升级为“Power Hub”
当前 Tauri 基本只是壳。

未来 EXE 应该承担：

### 1. 本地项目目录
- 打开/保存 project
- 保存资产
- 保存 storyboard/workflow/project bundle

### 2. 本地媒体处理
- FFmpeg 导出
- 视频转码
- 海量文件整理
- 缩略图缓存

### 3. 本地伴随服务
- 给插件和 Web 提供 localhost companion service
- 做重任务代理
- 做桌面级文件权限能力

### 4. 深链接和系统集成
- `flovart://project/...`
- 从浏览器插件唤起 EXE
- 从 EXE 接收外部导入任务

---

## 7.2 推荐桌面端新增能力层

建议未来新增：

```text
src-tauri/src/commands/
  projects.rs
  exports.rs
  assets.rs
  bridge.rs
  sessions.rs
```

以及前端新增：

```text
services/desktopBridge.ts
services/desktopProjects.ts
services/desktopExports.ts
```

### 作用
- 前端不直接感知 Rust 细节
- Web/EXE 共用一层 bridge adapter
- 功能边界更清楚

---

## 7.3 建议的 Companion 模式

P8 之后最值得做的是：

### Desktop Companion Service
由 EXE 启一个本地 companion endpoint，例如：
- `http://127.0.0.1:<port>`

由插件和 Web 去调用它做：
- 文件落盘
- 本地批量导出
- 视频编排
- 资产缓存

### 为什么这比让插件直接做一切更合理
因为浏览器扩展：
- 权限有限
- 文件系统能力差
- 长任务不稳定
- 不适合做重任务中心

而 EXE 天然更适合这类能力。

---

## 8. 推荐的共享能力清单

## 8.1 三端共享的“核心状态”

### 必须统一
- API Key context
- active provider/model
- active project
- active shot
- active session
- last output refs

### 可选统一
- 最近使用模板
- 最近导出 preset
- 最近 workflow 模板

---

## 8.2 三端共享的“动作”

建议统一这些动作：

```text
open.project
open.shot
capture.asset
generate.intoCanvas
generate.intoShot
workflow.run
export.bundle
publish.package
```

### 这样做的好处
以后：
- 插件
- Web
- EXE
- Claude / Skill
都能说同一种“动作语言”。

---

## 9. 推荐文件结构

### 新增

```text
types/ecosystem.ts
services/environmentResolver.ts
services/contextBridge.ts
services/desktopBridge.ts
components/diagnostics/EcosystemStatusPanel.tsx
components/desktop/DesktopCapabilityCard.tsx
components/extension/ExtensionConnectionCard.tsx
src-tauri/src/commands/projects.rs
src-tauri/src/commands/exports.rs
src-tauri/src/commands/bridge.rs
```

### 修改

```text
App.tsx
hooks/useApiKeys.ts
extension/background/service-worker.js
extension/content/content.js
extension/popup/popup.js
src-tauri/src/lib.rs
src-tauri/tauri.conf.json
skills/flovart/SKILL.md
metadata.json
```

---

## 10. 推荐实施顺序

### Step 1：先定义三端定位和上下文模型
- `ProjectContext`
- `SessionContext`
- `EnvironmentResolver`

### Step 2：把插件与 Web 的联动升级成项目级上下文
- 不再只是 pending_image / pending_prompt
- 开始支持 project / shot / asset ingestion

### Step 3：让 EXE 获得最小桌面专属能力
- 本地项目保存
- 本地导出入口
- 前端 `desktopBridge` 雏形

### Step 4：定义 companion 模式
- EXE 成为本地重任务端
- 插件/Web 可把重任务委托给 EXE

### Step 5：补统一诊断面板
- 当前运行在哪个端
- 当前连通了哪些桥
- 当前共享状态是否正常

---

## 11. 验证标准

这份生态规划真正落地后，至少应满足：

1. 插件采集内容能进入 project / shot / assets，而不是只进画布
2. Web 白板仍然是统一 UI 主端
3. EXE 不再只是打包版 Web，而是真正承担本地项目/导出/重任务能力
4. 三端共享 API Key、active model、active project 语义清晰
5. Claude / Skill / 插件 / EXE 不再各说各话，而是通过统一动作和上下文协作

---

## 12. 风险点

### 风险 1：三端都做主入口，导致产品分裂
解决：
- Web 做主 UI
- 插件做 capture edge
- EXE 做 local power hub

### 风险 2：过早把 EXE 做成“另一个前端宇宙”
解决：
- 先共用前端
- 后补桌面专属能力
- 不做两套产品

### 风险 3：插件和 EXE 直接做复杂通信，过早增加维护成本
解决：
- 先通过 Web runtime 作为中介
- 再逐步引 companion

---

## 13. 最后的建议

这份生态规划最重要的一句话是：

> **不要把浏览器插件、Web、桌面 EXE 做成三个版本；要把它们做成一个系统的三个端。**

也就是说：
- 插件负责采集与注入
- Web 负责统一创作体验
- EXE 负责本地能力和重任务

这样你未来的整个 Flovart 生态才会稳定，而且可持续扩展。

---

## 14. 推荐的下一个规划主题

如果你还要继续补完整生态路线，下一份最自然的是：

### P10：Desktop Companion + Native Services
重点做：
- companion service
- 本地文件系统权限模型
- 本地媒体代理
- 浏览器插件唤起 EXE
- EXE 承担导出/转码/缓存中心

这会把“桌面 EXE”从壳层真正升级成生态中枢。