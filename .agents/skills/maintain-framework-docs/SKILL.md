---
name: maintain-framework-docs
description: 维护 Unicore 使用与开发文档、框架 manifest、任务 Skills 和生成检查，避免引入研发流水。
metadata:
  author: yunnuo <ymz@ebox.vip>
---

# maintain-framework-docs

只读本次受影响入口：用户 docs/product，开发规范 docs/02-standards 与按任务的 runbook，贡献者 AGENTS/CONTRIBUTING，维护者 PRD/ADR/发布手册。不要要求每次读取全部 docs。

先核对真实代码、已有改动和读者，保留可复用操作说明、开发约定、当前限制和重大决策。一次性审查/验收报告、路线图、实测输出、截图流水、环境与工作区保护记录放 build/、CI artifact 或仓库外，不加入主仓库导航或生成上下文。真实测试夹具必须查消费者，不能作为文档垃圾删除。

framework.manifest.json 是机器索引；契约、主题、品牌、设置和 SQL 各自保留唯一来源。新增目录/Skill 时维护索引与元数据；Skill 正文只写任务流程、特有约束和检查，技术规则回链对应规范，不复制全文或固定阶段结论。

用户发行、派生项目和 Wiki 的唯一白名单在 distribution/manifest.json；新增源码文件不自动进入产品。修改 audience 时验证真实生成目录、精确文件清单和正文链接闭包，不能只检查配置或隐藏侧栏。

中文/英文 README 在同一 PR 同步，新增版本说明遵循发版手册双语分区；不能把两份入口等同详细手册已全量英译。

执行 make docs、pnpm check:docs、pnpm check:authors、pnpm check:release-notes；工具或分发变更运行相应测试。生成文件从源再生，不手改；保留命令、Skill、manifest 路径、作者头和生成一致性门禁。发现链接目标要移出时先修复活动引用并保留必要规则，不通过关闭检查过关。

前端界面、设置/权限描述保持中英文，复用 WorkspaceLayout、表单和消息；用户邮件/公告/笔记内容不自动翻译。后端约定以 backend.md 为准，状态范围以 docs/support.md 和当前实际检查为准。

交付说明实际修改、验证与未测项，放任务会话；不得把历史测试或本地 dirty 结果当当前远端/生产通过。此 Skill 不授予提交、外发或发布权限。
