---
name: maintain-framework-docs
description: 维护 Unicore 面向 AI 开发的文档入口、框架 manifest、任务 Skills 与上下文生成检查。
metadata:
  author: yunnuo <ymz@ebox.vip>
---

# maintain-framework-docs

框架入口为 framework.manifest.json、AGENTS.md、docs/README.md、docs/04-ai/development.md 与 .agents/skills/。从真实任务和代码变化确定需要维护的内容；当前能力状态与历史验收分开，避免复制整份架构或用户会话。

新增 Skill 时用独立名称/用途描述、简短任务流程、实际路径和验证命令；只在条件需要时链接参考文档。新增目录同时登记 manifest。不要加入全局安装依赖、空模板、真实凭据或隐含的发布/生产授权。

运行 pnpm ai:context、pnpm check:docs、pnpm check:authors，核对索引链接和命令确实可用。新脚本需实际执行；生成上下文不手改。与代码联动时同步相关规范和验收证据。
