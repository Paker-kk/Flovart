# 使用外部导演 Harness 与唯一内置 Operator

Flovart 只定义两个 AI 角色：一个独立运行的 External Coding Agent Harness 是唯一导演台，持有主对话、总体目标、长程计划和跨任务调度；一个轻量 Workspace Operator 是唯一内置执行 Agent，只在单个有界 Intent 内选择类型化工具并返回 ChangeSet、Task、Artifact 和 Receipt。Production Crew 只是 Operator、确定性 Capability 与 Runtime Worker 的执行面集合名，不是第三个 Agent 或多 Agent 团队。Codex、DeepSeek Harness、Claude Code、OpenCode、Pi 的模型工具均通过 Operation Skill + CLI 获得正式支持，Codex 与 DeepSeek Harness 优先增加深度会话和事件连接；Flovart 不暴露 Coding Agent MCP Server、不托管宿主生命周期、不镜像完整聊天，也不把宿主私有协议变成跨宿主核心。
