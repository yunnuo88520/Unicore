<!-- Author: yunnuo <ymz@ebox.vip> -->
# 以 AI 开发为主的工作流

从 [context.gen.md](context.gen.md) 确定组合根和唯一来源，再阅读当前需求与相关 ADR。`.agents/skills/` 随框架提交，不依赖作者个人的全局 Skill 安装；标准 Markdown/YAML 可供不同 AI 工具读取。根 [AGENTS.md](../../AGENTS.md) 保留跨任务约束，各 Skill 只写该任务特有的路径、约束和验收。

一次任务先定义用户能观察的结果和四个 profile 的影响，再改契约/设计源、实现、验证及文档。先检查已有功能和工作区修改，避免覆盖用户工作。可以在已有授权范围内连续实现和本地验证；提交、推送、发布、真实消息或生产变更遵循用户当前授权，Skill 不授予额外权限。

| 任务举例 | 需要修改的来源与验收 |
| --- | --- |
| 增加共享业务用例 | 领域/用例/ports，按需装配 adapter；用 CLI、HTTP、Wails 的同输入比对结果 |
| 新增平台接口 | OpenAPI operation/schema/权限，生成后端描述与 SDK 调用，handler 独立鉴权，检查路由覆盖 |
| 新增页面 | 注册 routes 与 PageContent，调用 AppClient；状态由 Query/会话边界管理；公共 Form 处理校验/字段错误 |
| 调整主题或品牌 | tokens.json/identity.json，生成后验证 PC/375px、浅深/系统及相应原生位置 |
| 修改存储 | 新增对应方言迁移，保留历史 checksum；独立测试库验证升级与失败重试 |
| 修改本工作流 | 更新 manifest/Skill 与实际命令；重新生成上下文并运行 check:docs |

上下文只记录可维护的事实：目标、边界、来源、关键决策和证据路径。不要复制完整会话历史、私人邮箱/密码、令牌、SMTP 凭据、真实数据库数据或未经核实的完成声明。阶段验收是历史记录；当前状态另行维护，不能把后续改动倒写成旧阶段已经实测。

中断后按 [任务模板](task-template.md) 记录当前分支/提交、已修改文件、已完成目标、失败/未执行检查和下一步。恢复任务时先核对工作区与当前文档；只重复因新修改或未解决问题而必要的检查。

完成一项功能时，更新该能力的规范、使用说明和当前状态；重大选择新增 ADR。运行 `make test` 与受影响构建，UI 用真实服务做 E2E，原生桥接用原生应用验证。报告具体结果与未测范围，不能以“已生成代码”“已构建”代替功能验收。

文件业务使用 `file_id` 与 `internal/files`，不自行拼路径或保存永久外链。存储扩展见 add-file-storage Skill、[运行手册](../03-runbooks/storage.md) 和 [ADR-0015](../adr/ADR-0015-file-storage.md)。

新业务优先参考可运行的 [个人笔记纵向样板](../03-runbooks/business-example.md)。派生项目用 create:project 和 doctor 初始化，自建业务迁移不改框架历史账本；代码归属及上游合并见 [约定](../03-runbooks/framework-upgrade.md)。

前端任务必须先查 [基础封装索引](../03-runbooks/frontend-foundations.md)；新增界面与中文词条、英文资源同一变更提交。先运行 `pnpm check:i18n`，再做英文页面、375px 与相关布局/方向验证。检查失败应补正确翻译或接入统一组件，不允许增加全局忽略列表、把界面文字搬到数据目录或关闭检查。业务样本文本与用户数据才保留原文。

新增后端业务先读 [统一后端规范](../02-standards/backend.md)，参考公告完整纵向样板；新聚合 BaseEntity 与稳定错误/分页、固定 admin/user 域及事务内鉴权必须落到实现和测试。邮件/公告正文是原始业务数据，不以 i18n 门禁为由翻译；界面仍补中英文。
