# Canvas Platform Convergence — Autonomous Handoff

## Current phase

G7 — Final Integration / Regression / Cleanup（已完成）

## Baseline

- 工作区在本 Goal 开始前已有大量未提交改动；全部视为用户工作，禁止回滚或覆盖。
- `.codex/GOAL.md` 是既有 Operation Registry 自治任务，本 Goal 与其并行，接口交叉时保持现有能力。
- G0 已完成只读审计；本轮接受的术语边界：Browser Draft / NativeWorkflowStore 是 State Authority，`applyWorkflowOps` 是 Browser document mutation kernel，`WorkflowExecutor` 是 generation authority，CLI/Bridge/Provider seams 是 adapters。
- 官方长时 Agent 实践已按 2026-08-27 当前资料复核：持续状态应落入仓库、长任务拆为可验证步骤、架构规则/测试/反馈/恢复应编码进 harness。

## Existing contracts to preserve

- `components/workflow/ops.ts`：现有语义 operation kernel。
- `components/workflow/draftAuthority.ts`：Draft ChangeSet、对象版本、Undo/Redo。
- `services/workflowExecutor.ts`：唯一节点 generation run/stop 入口。
- `components/workflow/inputResolver.ts`：现有 reference resolution 与 `CanonicalGenerationInput`。
- `services/workflowDispatcher.ts` + `services/workflowAgentBridge.ts`：Browser command adapter。
- `agent/session.js` + `agent/native-workspace.js`：Browser/显式 Native host adapters；Browser-bound 请求不会回落 Native，Native 仅由显式 Native/Headless workspace 使用。
- ADR 0065 与 SPEC-002：revision + mutationId + atomic `workflow.apply` + persisted receipt。

## G1 baseline findings

1. `WorkflowOp` 当前混合 document、view 与 execution semantics。
2. granular `workflow.*` command 各自构造并提交 mutation，尚无稳定 batch `workflow.apply` public contract。
3. Dispatcher 幂等缓存仅在内存，且同 key 不校验 payload；不能成为 document mutation authority。
4. Draft Authority 支持对象版本与 ChangeSet，但尚无 workflow-level `expectedRevision`、持久 mutation receipt 与 payload-reuse 拒绝。
5. UI 仍存在 `commitFrame/updateProject` 等 document write bypass，需要在不改变视觉交互的前提下收敛到底层 kernel。
6. Native workspace 注册后路由过宽；Browser-bound mutation 必须显式禁止 fallback。

## G1 implementation record

- 已复用现有 Draft Authority 与 `applyWorkflowOps`，没有新增第二套节点 mutation implementation。
- `WorkflowMutationEnvelope` 已固定 `projectId/expectedRevision/mutationId/source/ops`，Document、View、Execution 已分开；Document Ops 进入 ChangeSet/revision/Undo/Redo，View Ops 不改变 revision，执行仍只交给 `WorkflowExecutor`。
- `workflow.apply` 已加入 Browser Contract、Dispatcher、Agent、CLI registry；旧 granular `workflow.*` 仅翻译为同一批 Document Ops。
- mutation receipt 已按项目持久化并限制数量；同 mutationId 同载荷重放原 Receipt，不同载荷返回 `IDEMPOTENCY_KEY_REUSE`，过期 revision 返回 `REVISION_CONFLICT`。
- UI、CLI、DSH Browser projection 的 document writes 已进入同一 mutation kernel；交互拖动/预览仍保留临时内存投影，最终提交才形成 ChangeSet。
- Browser-bound Agent 没有连接时不会进入 Native Workspace；显式 Native 仍保留给 Native/Headless 场景。

## Verification status

- G0/source audit：完成。
- G1 targeted regression：通过（mutation envelope/receipt、dispatcher、editor、Agent session、CLI、store 等专项）。
- full Vitest：通过，单 worker `npx vitest run --maxWorkers=1` 为 128 个测试文件、908 个测试通过、1 个跳过（909 总数）。默认并行运行曾有 2 个 `workflowEditor` 超时；单文件与单 worker 均稳定通过，属于测试资源竞争而非断言失败。
- TypeScript：`npx tsc --noEmit` 通过。
- Production build：`npm run build` 通过；仅保留既有动态/静态导入与大 chunk 警告。
- `git diff --check`：通过（仅有既有换行提示）。
- browser smoke：真实可见浏览器已打开并加载 `Flovart` 主页面，Frontend/Agent 均 ready；但本机自动 bootstrap 后 `browserConnected` 仍为 false，CLI `workflow.project.list` 正确返回 `WORKSPACE_UNAVAILABLE`，未发生 Native fallback。该启动器/浏览器绑定问题记录为 G7 必须复查的环境风险，不能宣称浏览器 Gate 通过。

## Important invariants

完整列表见根目录 `GOAL.md`。当前重点：one mutation core、document/view/execution 分离、Browser-bound no Native fallback、legacy adapter-only、undo/redo 与多 Tab binding 不回归。

## G1 review notes

- 最后一轮审计确认 `commitFrame`、拖动预览和 `patchProject` 的直接写入只保留为临时/视图投影；最终 Document commit 统一由 `applyWorkflowMutation` 生成 ops 并调用 `applyWorkflowOps`。
- `recordWorkflowDraftSnapshotChange` 保留为兼容适配，但内部仍翻译到同一个 Draft mutation implementation。
- 没有读取或输出 Agent token，也没有把未绑定浏览器状态伪装成可用 Workspace。

## G2 implementation record

- 新增 `PromptIntent`，只携带 `targetNodeId/text/mentions/requestedAction`；Workflow Node PromptBar 在编辑、引用增删排序、生成/停止前发出 provider-neutral intent，未把 Provider、wire 参数或密钥放进该契约。
- `resolveWorkflowInputs` 现在把 PromptIntent、Graph、Asset、Runtime Artifact 和富文本 mention 统一为同一份 `GenerationReference[]`；提供新意图时忽略陈旧的 `mentionedNodeIds` 投影，保留资源身份、来源、顺序、角色与诊断。
- 生成链只从 `ResolvedNodeInputs` 构造 `CanonicalGenerationInput`，再一次性通过 `ProviderGenerationAdapter` validation/serialization；`first_frame/last_frame/reference/character` 角色矩阵已验证到最终 wire serializer。
- PromptBar 的产品模型、route、capability、参数归一化与费用展示计算已移到 `services/promptBarPolicy.ts`；UI 保留现有视觉与模型/参数交互，但不再直接导入 Provider Catalog、Gateway、route mapping 或 model-ref policy。

## G2 review notes

- 独立审计确认 PromptIntent 不包含 Provider/API key/wire 字段；旧 `mentionedNodeIds`、`imageReferenceOrder` 只在输入解析/兼容投影边界使用，未新增第二套引用数组。
- Graph + mention 去重、Asset、Runtime Artifact、I2I/I2V、Provider route capability、角色矩阵和实际媒体物化均有专项证据；Provider 无法消费引用时仍在提交前显式失败。
- 生成执行仍只由 `WorkflowExecutor` 调用，PromptBar policy 移出组件后没有改变已有 UI 视觉路径；full test 的并行超时用单 worker 重跑确认无功能回归。

## G3 implementation record

- Agent 的稳定 Workflow surface 已收敛为 `workflow.inspect`、`workflow.selection.get`、`workflow.apply` 与 `workflow.node.run`；`workflow.node.stop` 保留为执行控制兼容命令，仍只进入 `WorkflowExecutor`。
- 新增 `workflow.selection.get` 的 Registry、CLI alias、Dispatcher 与 Native explicit adapter；返回选择节点的脱敏投影，不写入 Draft、不改变 revision，Dispatcher 对读命令不复用旧缓存。
- 内置 Agent 与 Browser Agent 的 Workflow command envelope 现在强制 `workspaceMode: browser`；Agent 默认先 inspect/selection，再用结构化 `workflow.apply`，运行只走 `WorkflowExecutor`，禁止鼠标模拟、React/localforage graph 直读、Provider 重解析与隐式 Native fallback。
- `agent/session.js` 只在显式 `workspaceMode: native` 或没有 Browser 且已明确激活 Native workspace 时选择 Native；Agent source 和 Browser-bound command 永不降级到 Native。DSH Native Client 为每次请求显式标注 `workspaceMode: native`，没有改变 Browser authority。
- 旧 granular `workflow.*` command 继续作为 compatibility adapter，通过同一 Dispatcher/Draft mutation kernel；没有新增第二套 Browser document mutation implementation。

## G3 review and verification

- 审查确认 Document State、View State、Execution State 仍分开；`workflow.selection.get` 不增加 workflow revision，`workflow.node.run/stop` 不进入 mutation core。
- 专项与全量单 worker Vitest 通过：128 个测试文件、914 个测试通过、1 个跳过（915 总数）；`npx tsc --noEmit`、`npm run build`、`npm --prefix dsh-plugin run build` 与 `git diff --check` 通过。
- CLI 现场验证：未同步 Browser 时 `workflow.selection.get --json` 明确返回 `WORKSPACE_UNAVAILABLE`，没有进入 Native。真实可见浏览器从首页进入 `#/app`，Workflow 页面 HTTP 200、标题和主要文案正常、无 page/console error；本机 Agent 自动 bootstrap 后仍显示 `browserConnected=false`，绑定恢复列为 G7 环境风险，不能伪称已完成。

## G4 implementation record

- 现有 `providerGenerationAdapter` 继续作为 Official canonical capability/serialization adapter；新增 `ProviderGenerationExtensionRegistry` 与 `UserScriptProviderAdapter`，通过 `UserApiKey.extraConfig.providerScriptId` 选择用户线路，未绑定时仍走 Official adapter。
- User Script 的第一版明确采用受限 JSON mapping DSL，不执行任意 JavaScript；request、response、poll、cancel 由固定解释器执行，脚本上下文只有脱敏 canonical manifest 与已物化引用。
- endpoint 只允许 HTTPS 公网地址；path 只能留在同一 endpoint；受限 header、loopback、非 HTTPS 媒体地址和父级路径均明确拒绝。凭据以 opaque `read()` callback 交给宿主，只在最终 HTTP header 注入，不进入 mapping/body/节点/日志。
- `workflowGeneration` 选择 User Script extension 后跳过旧 Provider-specific route-mode 猜测，仍先完成 Canonical Input、extension capability validation 与 materialization；`executeUnifiedIgnition` 通过同一 canonical seam 执行 custom image immediate response 与 video task/poll/cancel。

## G4 review and verification

- 专项测试通过：User Script image wire mapping、Graph reference、video submit/poll/cancel、canonical ignition integration 与安全 endpoint 边界；Provider/Gateway 没有新增 Canvas 读取路径。
- 当前专项回归：4 个 G4 相关测试文件、119 个测试通过；全量单 worker Gate 为 129 个测试文件、918 个测试通过、1 个跳过；`npx tsc --noEmit`、`npm run build` 与 `git diff --check` 通过。
- 设计决策：不把 Infinite Canvas 的浏览器内任意第三方 JS trust model 带入 Flovart；Runtime/Desktop/CLI 的权限边界要求用户脚本保持声明式和最小权限。

## G5 implementation record

- 在既有 `WorkflowNodeDefinition`/`WorkflowResource` 注册表之上新增 `WorkflowNodePluginDefinition`：公共 SDK 以 `outputs`、可选 `inputs`、`render`、`panel`、`toolbar`、`onDoubleClick` 为节点扩展面，宿主将 `outputs` 归一化到既有 `output` Resource Contract；旧 `output` 仅保留为内部迁移兼容。
- 新增 `WorkflowNodePluginContext`：节点和图读取均为快照，更新只能转换为 `update_node`/结构化 Document Ops；插件私有存储按 project/plugin/node 命名空间进入 localforage，事件按 project/plugin 隔离，没有 Provider、Runtime DB、React store、凭据或 Canvas setter 暴露。
- `WorkflowNodePluginRegistry` 支持 install/update/enable/disable/uninstall，禁止重复 pluginId 与 node type；禁用/卸载只撤销渲染与输出注册，不删除项目中的节点，未知/已卸载节点仍可作为不可用占位被加载。
- `WorkflowNode` 和 `InfiniteWorkflow` 已挂载插件渲染、面板、工具栏、双击与 context.applyOps；内置图片/视频/音频及现有浮层路径保持不变。新增 Markdown、Storyboard Card、Style Bible 三个 reference plugin。

## G5 review and verification

- 独立边界审查确认插件 SDK 文件没有 Provider/Gateway/Runtime/React store/凭据依赖；插件渲染使用宿主快照，未知自定义类型不会索引内置规格，也不会在首页项目摘要显示 `undefined`。
- 专项测试：Node Plugin SDK、节点浮层、Workflow Editor、Workflow Ops 共 4 个文件、83 个测试通过；节点资源/输入解析专项共 3 个文件、19 个测试通过。
- 全量 Gate：单 worker `npx vitest run --maxWorkers=1` 为 130 个测试文件、922 个测试通过、1 个跳过（923 总数）；`npx tsc --noEmit`、`npm run build`、`npm --prefix dsh-plugin run build` 与 `git diff --check` 通过。Build 仅有既有大 chunk/动态导入提示。
- 仍需 G7 真实浏览器验收：参考插件目前通过 SDK/React 测试验证，自动 Bootstrap 后的 `browserConnected=false` 仍是既有 G7 风险，不能在本记录中宣称已完成。

## G6 implementation record

- 既有 `.agents/skills/flovart`/`skills/flovart` 保持为 capability/Operation Skill，明确负责 readiness、command discovery、inspect、structured mutation、execution 和 recovery；Production Skill 继续只提供制作 SOP、Gate 与 provider-neutral ProductionSpec，不直接执行 Runtime/Provider/Workflow。
- 新增 `services/promptAsset.ts`：统一 `id/title/text/tags/modality/modelHints/requiredReferenceRoles/optionalReferenceRoles/source/examples`，社区 PromptPack/Item 与内置快速提示词都经过同一归一化函数；支持按文本、标签、模型提示和 modality 搜索。
- PromptAsset 显式拒绝明显的 API Key/Bearer 凭据文本；Prompt、Skill 和 Workflow 仍不保存原始密钥或 Provider wire 配置。Workflow 快速提示词菜单、社区提示词详情已使用 PromptAsset，不改变生成或 Provider 路径。

## G6 review and verification

- 审查确认主 Skill 与 Production Skill 通过 `LocalSkillKind`/manifest/contentHash 分离；Skill registry、Hub 安装、内置包保护和 ProductionSkill attachment 继续沿用现有实现，未新增第二 Runtime。
- PromptAsset/Skill/Home/Workflow 相关专项为 5 个文件、32 个测试通过；全量 Gate 为 131 个测试文件、926 个测试通过、1 个跳过；`npx tsc --noEmit`、`npm run build`、`npm --prefix dsh-plugin run build` 与 `git diff --check` 通过。Build 仅有既有大 chunk/动态导入提示。

## G7 final integration record

- Fresh system Chrome 通过 `agentConnectionBootstrap` 打开 `#/app` 后自动建立 Browser binding；同一会话中 CLI `status --json` 返回 `ready: true`、Frontend/Agent ready、`clients: 1`、`hasWorkflow: true`，`workspace.status` 返回 `authority: browser-workspace`、`state: ready`，`nativeWorkspace: false`，无 page/console error。
- 真实浏览器 UI 回归通过：新增文本/配置节点、编辑文本、拖动节点、句柄连线、删除、Undo、Redo；节点与连线计数分别正确恢复/重做，未出现 page/console error。
- 同一浏览器会话的 CLI `workflow.apply` 成功写入 `plugin:markdown` 节点并实时渲染 Markdown reference plugin；CLI `workflow.inspect` 读到同一节点，`workflow.selection.get` 返回当前选中节点；stale `expectedRevision` 返回 `REVISION_CONFLICT`，不同载荷复用 mutationId 返回 `IDEMPOTENCY_KEY_REUSE`。
- G7 静态复核确认：Document mutation 仍由 `applyWorkflowMutation → applyWorkflowOps` 承担，View Ops 与 Execution 分开；旧 granular command 只作 compatibility adapter；PromptBar 没有 Provider wire/凭据职责；User Script/Node Plugin 没有 `eval`、`new Function`、Runtime 文件或原始凭据访问。

## G7 review and verification

- 全量 Vitest：131 个测试文件通过，926 passed、1 skipped（927 total），使用当前 Vitest 支持的 `--no-file-parallelism --maxWorkers=1`。
- TypeScript：`npx tsc --noEmit` 通过。
- Production build：`npm run build` 通过（4299 modules transformed）；仅保留既有动态/静态导入与大 chunk warning。
- DSH plugin build：`npm --prefix dsh-plugin run build` 通过，index/client loader contract verified。
- `git diff --check` 通过，仅输出 Git 换行转换提示；本 Goal 未回滚或覆盖既有用户改动，临时浏览器验收脚本已删除。
- 真实 Provider 付费生成未在本轮触发；G2/G4 的 canonical/reference/wire、custom image/video submit-poll-cancel 由专项测试和 fake provider fixture 覆盖，实际第三方凭据仍保留在用户确认范围。

## Surface Simplification implementation record

- 新增版本化 `host-registry.v1.json`，把 Agent Identity、IDE Host、Distribution Target、Runtime Surface 与 Director Runtime Binding 分开；`workbuddy` 只登记为未来 `skill-mediated` projection，未加入 Director Binding，`codebuddy-code` 使用 Coding Agent 身份，不与 WorkBuddy 混用。
- 新增 `host.list` PATH-only discovery 与 Agent Host picker；发现过程不扫描 auth/OAuth/API Key，picker 只保存 Host 偏好，不自动切换 Director 会话绑定。
- `init` 改为 `--target` 安装投影；`director.*` 接收 `agentIdentity` 并在 adapter 边界映射内部 Runtime binding。内置 Agent/Browser Agent 的公开面收敛为 `status`、`workflow.inspect`、`workflow.selection.get`、`workflow.apply`、`workflow.node.run`；`command.list/schema` 仅保留 CLI bootstrap/discovery/debug。
- Settings 的 Runtime 凭证继续保持 Runtime-only，不伪装成网页 BYOK；网页 AI 服务设置改为渐进展开，PromptBar 与相关入口使用 AI 服务/访问凭证产品词汇。
- 本轮审计发现并修复 `workflowDocumentOperationsFromFrames` 生成的 `reorder_nodes` 未被 `applyWorkflowOps` 执行的问题；该修复仍进入唯一 Document Mutation Core。

## Surface Simplification verification status

- Host registry、Agent tool surface、Agent Kernel、Workflow right panel 等定向测试已通过；当前新增/修改后的完整 Vitest、TypeScript、Production build、CLI smoke 与真实浏览器 Host picker/Workflow 路径仍需本轮继续执行。
- 不把 WorkBuddy probe、WorkBuddy Director Binding 或双 Tier-1 Host 作为本轮阻塞项；后续只在独立 mainstream Host Projection 目标中评估 WorkBuddy。

## Final status

此前 G0 只读审计与 G1-G7 Gate 已完成；本轮 Surface Simplification 在既有 Goal 上追加了 Host/Agent 契约收敛，待本轮新增实现的全量验证完成后再更新最终状态。此前的 Browser/CLI 证据不替代本轮对 Host discovery、picker 和精简工具面的验证。

## Next action

完成本轮自动验证后，再等待用户按 `docs/content/docs/progress/pending-test.mdx` 执行 Provider 凭据、默认 `start --open`、Codex golden path 和插件生命周期的产品级确认；不要把这些用户确认项误写成已完成能力。

# External Agent Golden Path — latest status

## Current phase

P10 — Final Autonomous Acceptance（代码与本地运行证据完成；外部登录/用户确认项保留为风险）

本节覆盖本文件早期 G7/Simplification 记录之后的最新结果。较早记录中的 `browserConnected=false` 基线风险已由下面的真实浏览器会话复测；没有外部 Codex 登录证据的部分仍不得写成通过。

## Phase evidence

- **P0**：已审计 `GOAL.md`、现有 HANDOFF、pending-test、ADR 0067、Host Registry、稳定 Agent Surface、init/director、Host Picker、Skill、DSH bundle 和 Browser bootstrap。WorkBuddy 维持未来 Mainstream Projection，CodeBuddy Code 单独作为 Coding Agent identity。
- **P1**：`init --target codex` 在临时项目真实生成 Codex Skill projection，canonical target 为 `codex-skill`，没有生成 MCP 配置；本地真实 Browser tracer 已完成 inspect、两个节点新增、移动、连线、节点修改、Undo/Redo、刷新与再次 inspect。真实 `codex exec` 已实际探测，但本机 `codex login status` 为 `Not logged in`，API 返回 401，未触发付费生成，因此“从新 Codex 对话发起”的最后一跳仍未验证。
- **P2**：新增唯一 `FlovartBootstrapCoordinator`，协调 Agent/Web/Browser readiness，不承担 Workflow mutation 或 Provider execution。`start --source --web --json` 在默认 Web 端口被占用时选择可用动态端口（实测 `6114`），通过页面标记拒绝误连其他 loopback 服务，并输出结构化状态；默认 `flovart start --open --json` 已真实复测通过，复用 `37522` WebUI、启动 `17373` Agent 并完成 Browser binding。另用隔离临时配置制造 Agent 启动失败，确认仍返回 `ok:false + frontend.ready + agent.offline`，不抛出堆栈。Windows URL 启动改用系统 URL handler，避免 `cmd /c start` 将 bootstrap 查询中的 `&agentToken` 拆成命令；bootstrap token 仍只走短期 URL 交换，不写入日志。
- **P3**：PATH-only `host.list` 实测发现 Codex、Claude Code、OpenCode、Pi、DeepSeek Harness；CodeBuddy Code 未安装；WorkBuddy 显示为未来入口且不可作为 Director Binding。真实 Host Picker 显示产品名称、可用/未安装/未来状态和 Active Writer CTA，不显示 executable、端口或 token；Picker 使用轻量 `includeVersion=false` 发现请求，版本信息继续留在 CLI/诊断。
- **P4**：Browser Workflow Session 按 `clientId/projectId/revision/mutationId` 约束写入；项目不匹配、stale revision、重复 mutationId 不同载荷、失去 active writer 都显式失败。Crew/Director Binding 另按 `agentIdentity → runtimeHostKind → externalSessionId → ProductionSession` 管理；不为没有稳定 session identity 的 Agent 伪造 `hostSessionId`，也不把 `director.bind` 强行接入普通 Workflow Dispatcher。多 Tab 不会静默抢写，重新绑定必须显式 activate。
- **P5**：真实浏览器证据覆盖 refresh 自动重新注册、关闭 active tab 后 `WORKSPACE_UNAVAILABLE`、第二 Tab 显式重新激活、运行时重启后重新连接、双 Tab writer 约束；运行失败显示缺少模型映射且 `paidProviderCalled=false`。证据文件见 `C:\tmp\flovart-external-agent-golden.json`、`C:\tmp\flovart-writer-recovery.json`、`C:\tmp\flovart-recovery-control-20260829-f.result.json`。
- **P6**：真实 RC8 DSH profile 已完成 install、dump-config、boot 和浏览器页面 smoke；隔离 Native Workspace 的真实 CLI 已完成 create/apply/inspect，run 返回明确 `RUNNER_UNAVAILABLE`，未回落 Browser 或伪造 Provider 结果。Workspace Operator 被精确终止后已真实自动重启并保持会话 URL，Native view 增加重启后的自动重注册；重启后 CLI 已完成 Director bind/handoff/status，旧 Binding 归档且新 Session 成为 Active。`profile:uninstall` 已验证只移除 Flovart profile 并保留 Workspace/其他 Profile；DeepSeek 真实对话和升级回滚因缺少登录态/发布条件未宣称通过。
- **P7**：Claude Code 与 OpenCode 已完成真实外部 CLI tracer：两者均由各自 Coding Agent 发起 `status → workflow.inspect → workflow.apply → workflow.inspect`，在同一 Browser-bound project 中成功新增临时文本节点并验证 `applied:true`、revision receipt 和最终节点；证据与清理 mutation 保存在 `C:\tmp\flovart-external-host-tracers-20260829.json`。Pi 正确拒绝不支持的专用 distribution target；CodeBuddy Code 当前未安装。
- **P7 补充**：另一次只验证 Claude Code 触发 bootstrap 的尝试在外部 Agent 自身达到 `$0.50` API 预算后中止，未返回完整 transcript；未调用 Provider/生成，也未修改仓库，因此不计入 Golden Path 通过证据。随后已用 canonical `start --open --json` 独立确认同一 Runtime/WebUI/Browser bootstrap 可用。
- **P8**：Host Picker 的显式选择现在会通过已认证的 `/hosts/prepare` 自动准备对应 Skill Projection；真实浏览器 smoke 从 bootstrap 页面进入 Agent Workspace，选择 Claude Code 收到 HTTP 200 并显示“Claude Code 的 Flovart Skill 已准备”，另一次选择 DeepSeek Harness 显示“由其 Plugin/Profile 管理”，WorkBuddy 仍为禁用的未来入口。地址栏 bootstrap 参数已清理，普通页面没有 URL、Token、端口或 executable；证据见 `C:\tmp\flovart-host-projection-20260829.json`、`C:\tmp\flovart-host-projection-20260829.png`、`C:\tmp\flovart-dsh-picker-smoke-20260829.json` 与 `C:\tmp\flovart-dsh-picker-smoke-20260829.png`。
- **P9**：首次运行 Picker 与 Agent 状态使用产品词汇；实现保留 Advanced Diagnostics 边界，运行时实际 URL、PID、client/project/revision 和日志只进入脱敏诊断，不进入普通页面或稳定工具返回。
- **P10 收口**：独立复核后，公共快速开始改为 `status → start --open（必要时）→ workflow.inspect`；Host Picker 使用 `includeVersion=false` 的轻量发现请求，版本探测保留在 `host.list`/诊断。定向 Host/Session/DSH 回归为 5 个文件、46/46；完整 Vitest 最新结果为 136 个文件通过、972 passed、1 skipped（973 total）。
- **P10 边界修复**：独立检索发现 Dock 未绑定态曾用时间戳伪造 DSH sessionId；现已删除自动绑定按钮，只保留复制显式 `director.bind` 命令，真实 Session 必须由外部 Harness/Plugin 提供。Dock、Host、Session、DSH 定向回归 40/40 通过。
- **P10 打包与 CLI 复测**：`npm pack --dry-run --json` 已确认 Agent/Host/Skill 模块进入 CLI 包；隔离临时项目实际启动 packaged Managed Agent，PATH discovery 返回 7 个 Host，并将 Codex Skill 写入调用方项目，不写入 bundle 目录。Toolkit launcher 保留调用方工作目录，并把 `FLOVART_PROJECT_DIR` 传给 Runtime/Managed Agent；启动失败会清理本轮拉起的子进程。脱敏记录见 `C:\tmp\flovart-packaged-agent-smoke-20260829.json`。
- **P10 新鲜 Browser tracer**：带 bootstrap 参数的新浏览器会话完成自动认证、创建 Workflow、激活 writer；真实 `flovart` CLI 完成 `workflow.inspect → workflow.apply`（新增两个节点、移动、改名、连线）→ 再次 `workflow.inspect`，页面出现两个更新后的节点且无 console error。该证据证明 canonical CLI/Browser 闭环，不冒充已登录 Codex 对话；脱敏记录为 `C:\tmp\flovart-canonical-cli-browser-golden-20260829.json`，截图为 `C:\tmp\flovart-codex-golden-20260829.png`。
- **P10 契约修复**：DSH CLI 参数对象/数组现在序列化为 JSON flag，不再发送 `[object Object]`；Rust Runtime 内嵌 Registry Hash 已与当前 canonical registry 对齐，`cargo test --all-targets` 全部通过。
- **P10 Launcher Writer hardening**：`buildBrowserBootstrapUrl` 只给 CLI 启动的新页面附加一次性 `activateBrowserWriter=1`；Browser bootstrap 认证成功后把信号存入 tab-scoped `sessionStorage`，消费一次并清除 URL 中的 token/flag。第一份 snapshot 发送成功后才调用 `/workflow/activate`，普通第二标签仍必须显式激活。`FlovartBootstrapCoordinator` 会记录打开前 Active Writer，并等待新页面真正成为 Writer，避免旧标签“ready 但 CLI 不可用”。真实双标签 smoke 已验证 client 切换、同项目、参数清除和 signal consumed；证据为 `C:\tmp\flovart-bootstrap-writer-20260829.json`，截图为 `C:\tmp\flovart-bootstrap-writer-20260829.png`。
- **P10 默认浏览器复核**：在精确重启本机 Flovart Agent、清除旧 SSE 客户端后，真实 `npm run flovart:cli -- start --open --json` 再次通过 Windows 默认 URL handler 打开 Edge，返回 `browser.status=connected`；随后顺序执行 `workflow.inspect --agent-identity codex` 与 `workflow.selection.get --agent-identity codex` 均命中同一 Browser-bound project（revision 10）。此前旧 Agent 进程的 stale in-memory client 会造成 `status` 旧快照乐观而 inspect 等待，已被明确识别并通过受控 Agent 重启恢复；没有用成功状态掩盖失败，也没有引入 Native fallback。最新恢复证据为 `C:\tmp\flovart-start-open-recovery-20260829.json`。
- **P10 安全执行 fixture**：在真实 Browser binding 上创建并随后删除隔离临时 Workflow，以本地 `image.crop@1` Operation 验证 `workflow.node.run --agent-identity codex` 经过 Browser `WorkflowExecutor` 成功生成新 Take/输出节点（revision 4 → 6、`providerCalled=false`、无付费请求）；原项目恢复为 revision 10、0 个节点，证据为 `C:\tmp\flovart-browser-node-run-local-fixture-20260829.json`。Provider 成功路径仍只由既有 fake/wire 测试覆盖，未写入真实凭据。
- **P10 CLI compatibility boundary**：修复 granular `workflow.node.tool` CLI 适配器的 typed argument normalization；`--x/--y/--width/--height`、时间/数值参数、逗号或 JSON 数组以及 dashed aliases 现在在进入既有 Dispatcher/Operation schema 前归一化。五个模型-facing tools 与 Workflow Core 均未扩展；`workflowCli` + `workflowDispatcher` 聚焦回归 26/26 通过。

## Architecture decisions

```text
Flovart Core
    ↓
Stable Agent Surface
    ↓
Host Projection / Distribution Adapter
    ↓
Codex / DSH / Generic CLI Hosts
```

- Core 不包含 Codex、DSH、CodeBuddy 或 WorkBuddy 分支；Workflow mutation 仍只有 `workflow.apply`，执行仍只有 `WorkflowExecutor`。
- `Agent Identity`、`Distribution Target`、`IDE Host`、`Runtime Surface`、`Director Binding` 和 Browser Session 不再由一个 `host` enum 承担。
- Browser-bound Workflow 没有 binding 时只返回 `WORKSPACE_UNAVAILABLE`；Native/Headless 只在显式模式使用。DSH 的 Native adapter 和 profile/bundle 依赖留在 `dsh-plugin/` 与 `agent/native-workspace.js` 边界。
- 正常 Agent surface 仍只有 `status`、`workflow.inspect`、`workflow.selection.get`、`workflow.apply`、`workflow.node.run`；`command.list/schema` 仅为 discovery/debug。

## Changed areas

- 启动与发现：`tools/flovart/bootstrap-coordinator.js`、`dev-commands.js`、`local-agent.js`、`local-status.js`、`web-discovery.js`、`host-registry.js`、`agent-kit.js`、`vite.config.ts`。
- 会话与 UI：`agent/session.js`、`services/agentConnectionBootstrap.ts`、`services/workflowWorkspaceAdapter.ts`、`services/workflowAgentBridge.ts`、`stores/useAgentConnectionStore.ts`、`components/agent/AgentHostPicker.tsx`、`components/workflow/WorkflowWorkspace.tsx`、`components/dock/ProductionControl.tsx`（不再伪造 Director Session）。
- DSH projection：`dsh-plugin/src/`、`dsh-plugin/scripts/profile.mjs`、`dsh-plugin/scripts/workspace-supervisor.mjs`、`dsh-plugin/assembly.json`、`agent/config.js`、`agent/crew/store.js`、`agent/native-workspace.js`。
- Host Projection prepare：`agent/host-projection.js`、`agent/index.js` 的认证 `/hosts/prepare`、`services/agentHostDiscovery.ts`、`components/agent/AgentHostPicker.tsx` 与 `tests/agentHostProjection.test.ts`。
- 启动/恢复：`tools/flovart/dev-commands.js` 的 Windows URL handler 与 WebUI 复用，`tools/flovart/bootstrap-coordinator.js` 的新 Writer 等待，`services/agentConnectionBootstrap.ts` 与 `tools/flovart/local-agent.js` 的一次性 bootstrap/URL 清理，`dsh-plugin/src/client/WorkflowView.tsx` 的 Native health re-register。
- 契约/文档/测试：Host Registry、5-tool surface、bootstrap、Web discovery、session/recovery、DSH native apply 和 browser smoke tests；临时 evidence 保存在 `C:\tmp`，不含凭据。

## Verification gates

- 定向新增回归：`flovartDevCommands` 13/13、`dshHarnessLauncher` + `dshNativeWorkflowView` 14/14、Host/Session/DSH 合并定向回归 5 个文件 46/46、`flovartAgentKit` 合并定向测试通过；另有 bootstrap/connection/adapter/local-agent 4 个文件 18/18；覆盖 Windows URL handler、profile uninstall、Workspace state isolation、Supervisor restart、Native re-register、轻量 Host discovery、新 Writer 等待和 Browser Writer/Binding 边界。
- 真实外部 CLI tracer：Claude Code 与 OpenCode 各自完成 `status → inspect → apply → inspect`；Provider/media generation 未调用，临时节点均经 `workflow.apply` 清理。
- `npx vitest run --no-file-parallelism --maxWorkers=1`：`136 files passed`，`972 passed | 1 skipped`（973 total）。
- `npx tsc --noEmit`：通过。
- `npm run build`：通过；仅有既有动态导入和大 chunk warnings。
- `npm run ext:build`：通过，生成薄 Browser Import extension；本轮未改变扩展权限/协议边界。
- `npm --prefix dsh-plugin run build`：通过，loader contract verified。
- `git diff --check`：通过，仅有 Git 换行转换提示。
- 真实浏览器 Workflow、Host Picker Projection prepare、writer recovery、Runtime recovery 和 DSH RC8 profile smoke：通过，Host Picker smoke 与新鲜 CLI/Browser tracer 的页面/控制台错误为空；关闭页面时的 SSE abort 已从证据中排除为测试清理事件。

## Remaining risks / exact next steps

1. 登录 Codex CLI 后，从全新 Codex conversation 重跑 `打开 Flovart → inspect → apply → run local fixture`，补齐真正外部 Codex transcript；不得使用真实付费 Provider 生成。
2. 用户确认默认窗口体验、手动画布路径和 Provider 配置/费用边界；本机默认 `flovart start --open --json` 的命令级和 Browser binding 证据已通过。
3. DSH 仍需真实登录态页面重载确认、升级回滚和显式 Browser/Native Authority transfer；profile uninstall、Workspace 崩溃重启、state isolation 和多 Session Handoff 已有本机证据。

本 Goal 当前不标记为完全完成：Claude Code/OpenCode 外部 tracer 已通过，但 Codex 登录态、用户可见确认和 DSH 部分生命周期仍是外部依赖；不存在需要恢复旧 Native fallback 的实现理由。

# External Agent Golden Path — P0 Audit

## Current phase

P0 — Baseline Audit & Pending-Test Reconciliation（已完成，进入 P1）

> 本节矩阵是 P0 开始时的历史基线；后续 P1–P10 的当前结论以本文件上方的 “External Agent Golden Path — latest status” 为准。表中 `Not yet` 不代表当前仍未完成，除非上方 Remaining risks 明确保留该项。

## Scope correction

- 本 Goal 的 Tier-1 重点是 Codex professional golden path；WorkBuddy 只保留为未来 mainstream projection 候选。
- `WorkBuddy`（普通用户 AI 办公工作台）与 `CodeBuddy Code`（Coding Agent/CLI）不作为同一个 Host 处理；当前 `director.bind` 不接收二者。
- 本轮以真实外部 Agent → Flovart CLI → Browser Workflow 的闭环为验收中心，不把旧的内部浏览器 smoke 或 `host.list` 结果误记为外部 Agent 通过。

## P0 evidence matrix

| Capability | Unit/Test evidence | Browser smoke | External Codex | DSH | Product confirmed |
| --- | --- | --- | --- | --- | --- |
| Host dimensions / PATH discovery | Host registry and discovery tests pass; planned WorkBuddy is not probed | Agent Host Picker mounted; offline state visible | Not yet | Not applicable | Pending real user path |
| Five-command Agent surface | Agent tool tests and CLI registry pass | Agent Workspace mounted | Not yet | Browser tools/CLI boundary needs real profile check | Pending |
| `init --target` projection | Dry-run coverage exists; real local install not yet recorded; `codex` shorthand still needs product alias | Not applicable | Not yet | Bundle install path exists, real profile check pending | Pending |
| Runtime/Web startup | Existing source start launches Agent/WebUI and waits on fixed Web URL | Prior smoke loaded WebUI | Not yet | Not yet | Not confirmed |
| Browser bootstrap/binding | URL token exchange and URL scrubbing have unit coverage | Prior smoke showed `browserConnected=false` in one run; no current external tracer | Not yet | Not applicable | Not confirmed |
| `inspect → apply → run` | Dispatcher/Draft/Executor tests pass; no Native fallback in Agent source | Internal CLI/browser path exists from prior Goal | Not yet | Plugin path needs real profile | Pending |
| revision/client/project lock | Draft mutation checks and stale revision tests exist | Multi-tab/close/reconnect product smoke not recorded | Not yet | Native boundary only | Pending |
| disconnect/recovery | SSE reconnect code exists; scenario evidence missing | Refresh/close/runtime exit not executed this Goal | Not yet | Not yet | Pending |
| DSH install/boot/remove | Bundle build coverage exists | Not applicable | Not applicable | Real `dsh --profile` smoke pending | Pending |
| manual Workflow path | Existing editor tests/full suite pass | Prior visible smoke covered basic operations | Not applicable | Not applicable | Pending fresh regression |

## Audit findings

1. `tools/flovart/dev-commands.js` starts the source WebUI by polling `URLS.web` (`localhost:37522`) and emits only frontend/agent state; there is no single bootstrap coordinator or browser-connected readiness result.
2. `tools/flovart/local-agent.js` uses the same fixed default WebUI URL. Agent URL/token handling is centralized enough to reuse, but dynamic Vite port discovery and browser registration are not represented in the CLI result.
3. `services/agentConnectionBootstrap.ts` authenticates and scrubs bootstrap parameters; `WorkflowWorkspaceAdapter` then publishes the current project over SSE. Browser binding recovery and session identity still need explicit product-level orchestration.
4. `agent/session.js` has an explicit Native adapter, but its selection predicate still treats a missing browser as a reason to choose Native for non-Agent sources. P4 must narrow this to explicit Native/Headless mode only.
5. `initCliHost` writes real Skill files, but the public target vocabulary is currently `codex-skill`; P1 must accept the user-facing `--target codex` projection without adding a Host-specific Core branch.
6. The DSH package already has a build/profile installer and a CLI-only degradation path; P6 needs real isolated-profile evidence, not another Core abstraction.

## P0 decision

The existing contracts are reusable. Proceed with a small bootstrap/readiness seam, a target alias/projection install improvement, binding hardening, and product recovery UI. Do not add WorkBuddy to Director Binding, do not expand the five Agent tools, and do not create a second Workflow mutation or execution authority.

## Next action

P1: implement the Codex projection alias and run a safe real Codex CLI tracer bullet against the local CLI; then wire the external path to the browser bootstrap coordinator before claiming the Golden Path.
# First Run → First Safe Generation — latest status

## Current phase

U1 — Local Fake Provider Harness（首个可测试纵切已开始）

## U0 audit findings

- Fresh Browser Workspace 可以进入 `/app` 的 Workflow 空态，但首次运行的 Onboarding 状态此前只由 `useApiKeys` 设置，`App` 没有真正挂载 `OnboardingWizard`；本轮已接入挂载与“稍后再说”的跳过标记。
- 旧向导默认 Google 且把兼容服务地址藏在高级设置中；本轮已把首次配置默认改为 OpenAI-compatible，普通步骤只要求“服务地址 + API Key”，模型与能力仍放在高级设置。
- `validateApiKey` 已经通过真实 `/models` 返回模型与能力，但保存入口此前不会自动建立 Product Model → Provider Route 映射，首个生成会被迫进入模型映射；本轮新增 `mergeSuggestedProductRouteMappings` 并接入新增 Key 与后台模型刷新，保留已有显式映射。
- PromptBar 在没有 AI 服务时已有设置入口，但生成按钮同时被 disabled 且没有 setup CTA；这一项仍待下一条 vertical slice 修复并用浏览器验收。
- 自定义视频适配器当前走 `${baseUrl}/v2/videos/generations` 的异步统一接口；Fake Provider 必须同时覆盖 `/v1` 模型/图片端点与 `/v2` 视频提交、轮询和下载，以验证真实现有执行链，不擅自改成第二套 Provider authority。

## Product decisions

- 默认产品词使用“AI 服务”，普通首启不要求用户理解 Provider、Route Mapping、Adapter 或 CredentialRef。
- OpenAI-compatible Base URL + API Key 是首启最小配置；成功 `/models` 后自动发现模型，并只追加缺失的产品路由建议，不覆盖用户已有映射。
- 本轮 Fake Provider 使用真实 localhost HTTP transport，记录脱敏的 endpoint、请求类型、模型、提示词与引用摘要；不保存 raw API Key 或原始 multipart/base64。
- 真实付费 Provider、Codex 登录和 DSH 登录不作为本 Goal blocker。

## Changed files

- `App.tsx`：实际挂载首启向导并持久化跳过状态。
- `components/OnboardingWizard.tsx`：默认 OpenAI-compatible，服务地址进入主步骤，错误文案收敛为用户可理解的连接错误，复用验证返回的模型列表避免重复 `/models` 请求。
- `services/aiServiceSetup.ts`：新增只追加缺失产品路由的深模块接口。
- `hooks/useApiKeys.ts`：新增服务和后台模型刷新时自动合并产品路由建议。
- `tests/aiServiceSetup.test.ts`、`tests/onboardingWizard.test.tsx`：首启最小字段与自动路由回归。

## Verification

- `npx vitest run tests/aiServiceSetup.test.ts --no-file-parallelism --maxWorkers=1`：通过。
- `npx vitest run tests/onboardingWizard.test.tsx --no-file-parallelism --maxWorkers=1`：通过。
- 已按 Playwright skill 先执行 dev-server detection；检测器未识别现有 Vite 进程，但 `flovart status --json` 确认 WebUI `http://127.0.0.1:37522` 与 Agent `http://127.0.0.1:17373` ready，根页和 Hash `/app` 已完成 U0 可见性采样。尚未把采样误记为首生成通过。

## Unresolved risks / exact next step

1. 添加真实 Fake Provider server 与 recorder，先通过 `/models`、图片生成和错误模式的 HTTP integration test。
2. 修复 PromptBar 无服务时的明确 setup CTA，并补 Cost/Execution Gate 的公共接口测试，确保 gate 发生在 Provider HTTP 之前。
3. 再用隔离 Browser Context 跑 clean-state：添加 AI 服务 → 自动发现模型 → 创建图片节点 → PromptBar 生成 → fake artifact 回画布；随后补 I2I/I2V、失败/刷新恢复和 secret 静态/运行时审计。

# Master Launch Goal — latest status

## Current launch phase

`R0 — RELEASE TRUTH AUDIT` 已形成第一版证据矩阵；当前 `LAUNCH VERDICT: NO-GO`。R0 只建立事实与门禁，没有把未验证能力标记为完成。

## Architecture decisions

- `LAUNCH_GOAL.md` 叠加在既有 `GOAL.md` 之上：旧 Goal 继续记录 Canvas/Agent 收敛历史，新文件成为 Release Candidate → Production Launch 的稳定终点。
- Published `main`、本地已提交架构与当前 dirty working tree 必须分开审计；本地修好但尚未发布，仍不能算陌生用户拿到的产品已修好。
- 五个 model-facing tools 保持不扩张；`command.list/schema` 只做兼容发现/诊断。
- 保留当前 First Run/Fake Provider 未提交改动，并将 fake HTTP recorder 作为费用授权、幂等、wire payload、失败与 secret 测试的共同 harness。
- Tauri 私钥文件只检查了 Git 跟踪/忽略边界，没有读取内容；生产密钥所有权、保管与签名仍属于 External Certification。

## Modified files

- `LAUNCH_GOAL.md`：持久化 R0–R31、Autonomous DoD、External Certification 与 GO/NO-GO 规则。
- `RELEASE_TRUTH_MATRIX.md`：区分公开分支、本地源码和 working tree，记录 claim、证据、状态与 blocker。
- `HANDOFF.md`：追加当前 Master Launch Phase、R0 结论与下一动作。

## Evidence produced

- 公开 README/Quick Start 仍展示 `init --host`、正常路径 `command.list/schema`、`canvas.inspect` 与 command-queue/file-state 描述；本地实现已转向 `--target`、五工具表面、Browser authority 和自动 binding。
- `node tools/flovart/cli.js help` 正常，但标准 `--help` 返回 `CLI_FATAL`，命令被解析为 `..help`。
- `.agents/skills/flovart/SKILL.md`、`tools/flovart/skill/SKILL.md`、`skills/flovart/SKILL.md` 内容不一致，且打包安装选择 tools copy。
- `tools/flovart/shadow-runtime.js` 及其测试仍保留完整 file-state Workflow 实现；当前 public Workflow command 虽走 Browser Workspace，但必须继续证明该实现是否只有安全兼容 caller。
- 本地产品版本文件统一为 `0.3.2`；公开最新 Release 仍是旧 test artifact。
- Desktop publish workflow 没有把 unit/type/Rust/extension/DSH/E2E/migration/security/checksum/SBOM/attestation 组成不可绕过的 release law。
- `workflowDispatcher` 接受 `args.confirmed === true`；Browser bridge 会真实询问用户，但还需证明外部 Agent/CLI 是否可直接伪造该字段并触发 Provider 请求。

## Current blockers

- **P1:** 公开文档仍描述已退出主路径的架构。
- **P1:** 三份 Flovart Skill 没有同一事实源。
- **P1:** `--help` 不可用，发布流水线缺少完整门禁。
- **P1 claim drift:** Table、Plugin lifecycle、Codex/DSH/Pi 正式支持与当前安装器的公开成熟度超过已验证证据。
- **P0 candidate:** caller-controlled `confirmed:true` 可能绕过真人费用授权。
- **P0/P1 candidate:** 生成幂等 cache 仅在内存，刷新/重启 exactly-once 尚未证明。

## Tests / browser / failure injection

- R0 文档阶段只执行了 CLI help、registry/version、静态 caller/claim 搜索与公开页面核验；没有把既有 972-test 历史结果当作当前 working tree 回归。
- Browser First Generation、Provider wire recorder、重复提交与刷新/重启故障注入仍属于下一纵切，状态为 `NOT_VERIFIED`。

## Next action

先用现有 fake Provider recorder 写一个失败测试：外部 `workflow.node.run` 携带 `confirmed:true` 时必须仍然是 `CONFIRMATION_REQUIRED` 且 Provider submit count 为 0。若复现绕过，改为执行边界签发、作用域绑定、单次消费的 approval receipt；随后对 timeout/retry/double-click/refresh/restart 跑同一 recorder 幂等矩阵。完成后再收敛 Skill/CLI/docs truth source。
