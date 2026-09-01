# Flovart Support Matrix

这份矩阵是当前仓库证据的发布口径。`Stable` 只表示本地可重复验证的契约或能力，不等同于已经完成第三方登录、真实付费 Provider 或公开发布认证。

## External hosts

| Host / projection | Status | Evidence / boundary |
| --- | --- | --- |
| Codex CLI + Browser Workflow | Experimental | `RC_HOST_CHAOS_EVIDENCE.md`；真实登录和公开安装包认证仍是 external gate |
| Claude Code CLI projection | Experimental | CLI tracer 与共享 Skill/CLI contract；没有 Host-specific Workflow logic |
| OpenCode CLI projection | Experimental | CLI tracer 与共享 Skill/CLI contract；没有 Host-specific Workflow logic |
| DeepSeek Harness bundle/profile | Experimental | `RC_PLUGIN_EVIDENCE.md`、DSH build/profile tests；登录态与上游 developer-preview 运行态仍待认证 |
| CodeBuddy Code | Planned | 通过通用 Host Projection + CLI contract 兼容；尚未完成本机登录 tracer |
| Pi | Planned | 通过通用 Host Projection + CLI contract 兼容；尚未完成本机登录 tracer |
| WorkBuddy | Planned mainstream projection | 普通办公 AI 入口候选；不属于当前 Director Binding，也不与 CodeBuddy Code 合并 |

## Runtime and provider paths

| Capability | Status | Evidence / boundary |
| --- | --- | --- |
| Stable CLI surface (`status`, `workflow.inspect`, `workflow.selection.get`, `workflow.apply`, `workflow.node.run`) | Stable | RC1 docs contract、Agent surface tests、`workflow.apply` mutation authority |
| Browser-bound Workflow authority | Stable | `RC_HOST_CHAOS_EVIDENCE.md`；无 Browser binding 时显式失败，不回退 Native Workspace |
| Local Fake Provider HTTP fixture | Stable test fixture | `RC_PROVIDER_RESILIENCE_EVIDENCE.md`、`tests/releaseCandidateProviderResilience.test.ts` |
| OpenAI-compatible BYOK | Experimental | 本地 Fake Provider + Browser E2E；真实供应商、价格与取消语义仍待认证 |
| Seedance / RunningHub / other remote providers | Experimental | 代码路径与路由映射存在；真实账号、账单和生产失败语义未列为 Stable |
| Custom provider mapping / scripts | Experimental | 配置能力存在；脚本在不可信输入场景下不作为秘密隔离边界 |

## Extensions

| Extension | Status | Evidence / boundary |
| --- | --- | --- |
| Built-in Workflow node plugins | Experimental | `RC_PLUGIN_EVIDENCE.md`；当前为进程内 trusted code，故障隔离不是安全沙箱 |
| DSH installable bundle | Experimental | DSH bundle/profile build and contract tests；生产登录与公开分发仍待认证 |
| Community Skill package install | Experimental | `RC_SECURITY_EVIDENCE.md`；路径、大小、数量和重复项在安装边界校验 |

## Release gates still outside autonomous evidence

- 真实 Codex 登录和从公开安装包首次启动的完整 transcript；
- 真实 Provider 账号、价格、扣费、取消和服务条款行为；
- DSH 真实用户登录（若宣传为稳定能力）；
- 生产 updater signing private key、GitHub Release publication、Windows Authenticode；
- GitHub hosted CodeQL、dependency review、secret scanning/push protection 的仓库级启用与首轮结果；
- 对第三方 Host/Plugin 的长期兼容承诺。

README 与产品宣传不得把 `Experimental` / `Planned` 项写成已认证的 Stable 能力。
