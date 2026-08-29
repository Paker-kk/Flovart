# 统一 Production Skill 契约与包边界

Flovart 只使用两类 Skill 语言：Operation Skill 指导 External Coding Agent Harness 的模型工具只通过 CLI 操作 Flovart；Production Skill 是外部导演台可采用、Production Crew 可执行的制作方法。Operation Skill 不编译制作计划，Production Skill 不直接操作 Workspace、持有 Provider Secret 或提交 Provider 请求；带代码的宿主插件或 Toolkit Plugin 是独立扩展类型，不属于 Skill。

所有 Production Skill 输出共享的 ProductionSpec Core，只能声明 Runtime Capability Requirement、Skill Gate 与 `extensions.<skill-id>` 下的受 Schema 校验扩展。一个 ProductionSession 可以不绑定 Production Skill，但最多绑定一个精确版本或本地 Snapshot；切换绑定必须产生新的 Workflow Draft 与 ProductionSpec Revision，不能让多个 Skill 并发改写同一制作计划。

Production Skill Package 使用精炼 `SKILL.md` 与 `flovart.skill.yaml` 声明身份、版本、兼容性、Capability、Gate、扩展 Schema 和 Eval。公开版本不可变并以版本与 Hash 锁定；社区分发前完成静态校验、零费用 dry-run、许可证与基础评测，撤销只作用于精确版本。Package 不携带可执行脚本；需要确定性转换时，先把它实现为经过版本、Schema、权限和测试约束的 Runtime Capability，或单独安装为受信任 Toolkit Plugin。Skill Authoring 与正常 Production Workspace 保持隔离。
