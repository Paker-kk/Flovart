# @flovart/dsh-plugin — DeepSeek Harness 内部工作页

> 当前兼容集：DeepSeek Harness `0.1.0-rc.8`、Node `^22.19.0 || >=24.0.0`。
> 已在真实 RC8 Web Profile 中验证原生 `Flovart` 页签、自动 Workspace 准备、Profile 启动、原生页面加载和五个稳定 Workflow 工具；Workspace Operator 崩溃重启、Native view 重注册和多会话 Handoff 已有本机证据，完整 Harness 登录态恢复与失败升级回滚仍需单独放行。

## 用户路径

1. 在仓库根目录运行 `npm run dsh:start`。
2. 启动器准备只含工作区命令面的 Workspace Operator，再启动 `flovart` Harness Profile。
3. 在 DeepSeek 主会话中切换到 `Flovart` 页签。
4. 没有内容时先填写 Production Brief；已有 Draft 时直接恢复工作页。

用户不需要填写 Runtime 地址或 Token，也不需要先打开独立 Flovart WebUI。DeepSeek 主对话是唯一指挥入口，Flovart 页签只承载 Workflow、制作状态和产物。

## 组成

| 部分 | 职责 |
| --- | --- |
| `cordis.patch.yml` | 向专用 Profile 插入一个 `flovart` Host/Client 行 |
| `src/index.ts` | 提供 CLI 工具派生与受限 Workspace 同源代理 |
| `src/client/` | 注册原生 `conversation.view` 与 `shell.overlay` |
| `scripts/build.mjs` | 构建 Host ESM 与 RC8 `__ModuleLoader__` Client bundle |
| `scripts/profile.mjs` | 安装、诊断、启动 Profile，并管理 Workspace Operator 生命周期 |
| `assembly.json` | 锁定兼容集和隐私边界 |

## RC8 边界

- 不占用根 `sidebar`、`conversation` 或 `conversation.session`。
- 不注册额外侧栏入口，不使用 iframe，也不把用户带进第二套 Agent/聊天页面。
- 浏览器只访问 Harness 同源的 `/flovart-workspace`；Host 仅代理 `health`、原生工作页注册、Workflow 命令和 Director Binding 四类路由。
- Workspace Token 只存在于启动器环境和 Harness Host，不序列化到浏览器，不进入节点、Draft、回执或 Provider 参数。
- Provider、付费 Production Gate、Task/Event 与 Artifact 权威边界保持不变。

## 构建、安装与启动

从仓库根目录：

```bash
npm run dsh:profile:install
npm run dsh:start
```

包内诊断：

```bash
npm run build
npx tsc --noEmit
npm run profile:doctor
npm run profile:start
npm run profile:uninstall -- --home <temporary-or-user-dsh-home>
```

`profile:install` 会生成 `$DSH_HOME/profiles/flovart`，按
`@deepseek-ai/dsh-base → @deepseek-ai/dsh-web-app → @flovart/dsh-plugin`
组合 Profile，并通过 `--dump-config` 校验安装结果。`profile:start` 使用随机可用 Web 端口，Harness 退出时一并停止由本次启动创建的 Workspace Operator。

## 当前验证证据

- `profile:install` 已真实完成 bundle 安装、版本/loader 校验和 `--dump-config`；`profile:start` 已真实启动隔离 Workspace Operator、RC8 Profile 和 Web 页面。
- RC8 Profile 能启动，插件进入 boot 图谱并通过公开 Slot 生命周期挂载；修复 `conversation.view` 缺少 `sessions` 注入后，真实 RC8 页面无 plugin error。
- `Flovart` 是会话内部原生页签；真实浏览器中 iframe 数为 0，手填地址/Token 控件数为 0，外部 Flovart 侧栏按钮数为 0。
- 新工作区不会预造空项目；Production Brief 会创建为首个文本节点并绑定当前 Harness Session。
- 真实浏览器已完成 RC8 Profile 页面 smoke，无页面异常或控制台错误；完整 Production Brief 对话仍受本机 DeepSeek 登录态限制，未用付费凭据冒充通过。
- 隔离 Native Workspace 的真实 CLI tracer 已完成 `workflow.project.create → workflow.apply → workflow.inspect`；`workflow.node.run` 在没有可见 Browser Workflow/Provider 时返回明确 `RUNNER_UNAVAILABLE`，没有 silent fallback 或假执行。
- Workspace Operator 被精确终止后，Supervisor 已真实以相同 `http://127.0.0.1:17373` 会话重新拉起；Native view 增加健康检查，恢复后会重新注册 Native Workspace，避免只恢复进程而丢失 authority。
- 重启后的真实 CLI 已完成 `director.bind → director.handoff → director.status`，旧 Binding 归档且 Active Writer 切换为新 Harness Session；Workspace 数据仍在同一隔离目录。
- `profile:uninstall` 已真实验证只移除 `$DSH_HOME/profiles/flovart`，保留 DSH_HOME 其余内容、Workspace 数据和其他 Harness Profile。
- Host/Client TypeScript、bundle loader 契约、同源代理白名单、稳定五工具派生和定向 UI/Store 测试均通过。

## 仍需放行验证

1. 在真实 DeepSeek 登录态下确认 Harness 页面重载后仍自动重注册，并保存页面/会话证据；当前本机无登录态，不能冒充完成主对话验收。
2. 不兼容升级的原子回滚、插件禁用后的 CLI-only 路径与发布态升级回归。
3. Native Draft 与 Browser Workspace 的显式 Authority 转移。
