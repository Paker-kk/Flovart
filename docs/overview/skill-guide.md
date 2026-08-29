# 外部导演台与 Production Skill 使用手册

这份手册面向想用 Codex、DeepSeek Harness、Claude Code（CC）、OpenCode 或 Pi 指挥 Flovart 制作、但不想先学习 CLI、Manifest 或 ProductionSpec 的创作者。五者都是正式支持的 External Coding Agent Harness。

## 先记住一句话

**系统只有两个 AI 角色：外部 Coding Agent Harness 是导演台，内置 Workspace Operator 是执行 Agent；Operation Skill 教导演通过 CLI 操作，Production Skill 提供制作方法，其余 Production Crew 组件都是工具或服务。**

你只要在自己的 Coding Agent 中描述目标；宿主支持 Skill 发现时会加载合适的 Production Skill。想明确指定 VOX Skill，可以在请求中写技术调用句柄 `$vox-director`。

## 产品层的两类 Skill

| 名称 | 定位 |
| --- | --- |
| Flovart | 整个产品 |
| External Coding Agent Harness | 用户直接协作的导演台，持有主对话和总体计划 |
| Workspace Operator | 唯一内置执行 Agent，只处理一个有界 Intent |
| Flovart Production Crew | Operator 与 Runtime/Worker/Tool 的执行面集合名，不是额外 Agent |
| Operation Skill | 指导 Harness 通过 Flovart CLI 操作产品的宿主说明 |
| Production Skill | Harness 可采用、Production Crew 可执行的制作方法 |
| VOX Skill | 一个具体 Production Skill |

供 Codex、DeepSeek Harness、Claude Code、OpenCode、Pi 使用的 `SKILL.md` 都属于 Operation Skill。它只指导 Harness 的模型工具调用公开 CLI；Flovart 不向 Coding Agent 暴露 MCP Server。Operation Skill 与 Production Skill 都不保存 API Key，也不直接请求 Provider；实际执行、费用和产物仍由 Flovart Runtime 管理。带代码的宿主插件或 Toolkit Plugin 是第三类扩展，不属于 Skill，必须单独安装和授权。

## 最低成本的使用方式

### 在任一正式支持的 Coding Agent Harness 中（推荐）

先确认项目已经安装 Flovart Operation Skill，然后直接用自然语言描述任务：

```text
把“为什么人们越来越难专注”做成一条 30 秒中文纸张拼贴解释短片。
先给我叙事节拍和视觉方向，不要开始付费生成。
```

如果你想固定使用某个制作方法：

```text
使用 $vox-director，把“为什么人们越来越难专注”制作成 30 秒中文短片。
先给我叙事节拍和 3 套视觉主题供确认；未经确认，不要开始付费生成。
```

### 当前 Desktop 过渡入口

1. 打开应用首页 `#/app/home`。
2. 找到“选择一种制作方法”。
3. 点击 Skill 卡片，先看适用场景和示例调用词。
4. 复制调用词，在你的外部 Coding Agent Harness 中发送。

当前代码中的“在本机 Agent 中试用”仍会打开旧内置主 Agent，这是待迁移路径，不代表目标架构。选择 Skill 本身只准备方法与草稿，不会自动调用 Provider 或产生费用。

### DeepSeek Harness 完整嵌入目标

DeepSeek Harness 将通过专用 Flovart Profile/Plugin 形成完整插件体验：Harness 保持主壳与主会话，左侧固定 Flovart Dock 打开中央 Workflow、Table 与 Agent Production Control，快速弹层处理审批/状态/Artifact，右侧 Agent Bridge 管理连接与单导演 Handoff，并保留独立窗口。Host Plugin 从公开 CLI Registry 渐进暴露精确模型工具并通过 CLI 执行；Client Plugin 只负责隔离 UI、事件游标和恢复。首次安装 Runtime、升级兼容集和新增权限都必须由用户确认。该 Profile 尚未完成真实安装与恢复验收，因此当前仍按上面的通用外部 Harness 路径使用。

不要为了“正确调用 Skill”去背一整条标准 Prompt。高质量请求只需要四项：

- **内容**：主题、文章、Brief 或已有素材；
- **交付**：时长、语言、横竖屏和用途；
- **约束**：品牌、受众、禁用内容或必须保留的事实；
- **决策点**：哪些步骤必须先让你确认。

## 三个可直接改写的模板

### 从一个主题开始

```text
使用 $vox-director，把【主题】制作成【30 秒】中文【9:16】解释短片。
受众是【目标受众】，希望观众看完后【行动或认知变化】。
先给我叙事节拍和 3 套视觉主题；未经确认，不要生成付费素材。
```

### 从文章或研究材料开始

```text
使用 $vox-director，基于我提供的文章制作【45 秒】中文短片。
保留可核验事实和来源，不要把推断写成事实。
先输出核心论点、删减建议和镜头节拍，等我确认后再制作。
```

### 修改已经存在的计划

```text
继续使用 $vox-director。保留当前已确认的视觉主题，只修改第【3】个镜头：
【写明问题与目标】。
只重做受影响的阶段，不要重新生成其他已通过的镜头。
```

## 发送后会发生什么

1. External Harness 根据名称与描述发现并加载相关 Skill。
2. Production Skill 把主题整理为 Provider-neutral 的制作计划。
3. Harness 先向你展示叙事、主题和必要的人工检查点。
4. Harness 经 CLI 把计划交给 Production Crew；`production.dry-run` 可编译出 ProductionRun 和可见 Workflow Projection。
5. 路线、预算或审批未完成时，计划保持阻塞状态，不会被冒充为已完成成片。
6. 只有你确认后，Runtime 才能进入需要 Provider 的执行阶段。

`production.dry-run` 本身不提交 Provider，也不消耗生成额度。

## 如何确认 Skill 真的生效

不要只看 Harness 有没有说“我正在使用 Skill”。至少检查以下三项：

- 回复中出现与该 Skill 对应的制作结构，例如 VOX Skill 的叙事节拍、主题试片、关键帧审片和 OCR 检查；
- Harness 能报告精确的 Skill ID、版本与内容 Hash，例如 `community.vox-director@1.0.0`；
- 编译后能在当前 Workflow 中看到与 ProductionRun 对应的计划节点，而不是只得到一段聊天文本。

如果 Agent 只复述“纸张拼贴风格”，却没有执行 Skill 定义的检查点，应视为没有真正使用。

## 给进阶用户的检查命令

普通创作者不需要运行这些命令。只有在排查连接或核对真实状态时再使用。

先查看当前唯一可信的命令注册表：

```bash
npx flovart-cli command.list --json
```

确认桌面端和当前可见 Workflow 已连接：

```bash
npx flovart-cli workspace.status --json
npx flovart-cli workflow.inspect --json
```

调用写命令前先读它的当前 Schema：

```bash
npx flovart-cli command.schema --command production.dry-run --json
```

仓库贡献者可把 `npx flovart-cli` 换成：

```bash
npm run flovart:cli -- <command> --json
```

只使用 `command.list` 中标记为 `available` 的运行命令。旧文档、旧示例或 Skill 说明与注册表冲突时，以注册表为准。

## 常见问题

### 我必须写 `$vox-director` 吗？

不必须。Agent 会根据 Skill 描述自动匹配。显式名称适合以下情况：

- 有多个相似 Skill，需要固定一个；
- 你正在复现上一次制作；
- 自动匹配没有触发；
- 你需要审计准确的 Skill 版本。

### 为什么按钮没有直接开始生成？

这是有意设计的安全边界。选择 Skill 只是在确定制作方法；生成会涉及模型线路、预算和人工审片，不能在用户还没看计划时自动扣费。

### 为什么浏览器版不能独立充当导演台？

主对话、Skill 发现和总体计划属于外部 Coding Agent Harness。普通网页可以展示 Workflow 与 Production Crew 状态，但不能冒充外部 Harness，也不应建立第二条主对话。

### Agent 说找不到 Skill 怎么办？

1. 确认当前项目中存在 `.agents/skills/<skill-name>/SKILL.md`。
2. 确认 `SKILL.md` 的 `name` 与 `description` 清楚描述了适用任务。
3. 重新开始一个 Agent 任务，让 Host 重新发现 Skill 目录。
4. 用显式名称重试，例如“使用 `$vox-director`……”。
5. 仍失败时，检查当前 Agent Host 是否支持 Agent Skills。

### 为什么计划仍显示阻塞？

常见原因是 Provider 路线、预算、必要能力或人工 Gate 还没有确认。阻塞不是失败；它是在阻止系统越过你的费用与质量边界。

## 当前产品边界

- 当前首页提供一个真实内置示例：`community.vox-director`。
- 第三方 Skill 的安装、签名、权限、发布与撤销仍在建设中。
- Codex、DeepSeek Harness、Claude Code、OpenCode、Pi 的模型工具基线都是 Operation Skill + CLI；没有 Coding Agent MCP Server。Codex 与 DeepSeek Harness 的深度 Session/事件连接优先实施，DeepSeek 另有完整嵌入 Profile 目标；这些增强不影响其他三者的完整 CLI 支持。
- 当前 Desktop 的旧内置主 Agent 入口仍待迁成 Production Crew 控制面；请优先在外部 Coding Agent 中发起主任务。
- Runtime Artifact 到对应计划节点的自动挂载仍在完善，不能仅凭计划节点判断成片已完成。

## 设计依据

Flovart 遵循 Agent Skills 的渐进式披露方式：Agent 先只看到 Skill 名称和描述，匹配任务后再加载完整说明与所需资源。该方式能降低常驻上下文成本，也意味着 Skill 的名称、描述、示例和首次成功路径比堆更多技术参数更重要。

- [Agent Skills 概览](https://agentskills.io/home)
- [Agent Skills 客户端实现与渐进式披露](https://agentskills.io/client-implementation/adding-skills-support)
- [Skill 描述优化](https://agentskills.io/skill-creation/optimizing-descriptions)
- [Claude：使用 Skills](https://support.claude.com/en/articles/12512180-use-skills-in-claude)

完整角色边界见 [Agent 架构设计包](../design/agent/README.md)。
