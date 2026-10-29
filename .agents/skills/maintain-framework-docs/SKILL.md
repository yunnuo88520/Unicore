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

派生项目初始化、笔记业务样板、离线备份/恢复和框架上游合并的当前说明位于 docs/03-runbooks；重大边界见 ADR-0017。最新状态记入 acceptance-developer-kit.md，不把候选工作流配置当作远端执行成功。

涉及前端时同步 frontend-foundations.md、frontend.md 与 add-react-page/add-setting Skill；manifest 保留 WorkspaceLayout 与 i18nGate 的真实入口。中英文不是后续可选项：验证 pnpm check:i18n 已纳入构建和 make test，新增功能页面加入英文巡检。不能用文档声明替代机器检查或页面验收。

后端约定集中于 docs/02-standards/backend.md，公告完整样板与当前验收见 docs/03-runbooks/announcements.md、acceptance-announcements.md；新增实体检查与迁移级别须和真实代码一致。不要把“中英文 UI”误扩展成自动翻译用户输入、公告或邮件默认业务内容。
