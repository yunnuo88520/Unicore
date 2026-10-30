<!-- Author: yunnuo <ymz@ebox.vip> -->
# AI 开发工作流

先核对分支、HEAD 和未提交修改，明确用户可观察的目标与受影响 Profile。按下面的任务索引读取对应 Skill、规范和必要代码，不默认读取完整 PRD、全部 ADR 或历史过程材料。

| 任务 | Skill | 按需规范 |
| --- | --- | --- |
| Go 模块/用例 | add-go-module | [后端规范](../02-standards/backend.md)、[笔记样板](../03-runbooks/business-example.md) |
| API/DTO/SDK | add-api-operation | [接口契约](../02-standards/api-contract.md)、目标 OpenAPI operation 与服务端权限 |
| 页面/主题/双语 | add-react-page、add-setting | [前端规范](../02-standards/frontend.md)、[基础封装](../03-runbooks/frontend-foundations.md) |
| 身份与权限 | add-platform-permission | [权限契约](../api/permissions.md)、当前入口及事务鉴权 |
| 数据库 | db-migration | [迁移规范](../02-standards/database-migrations.md)、目标 SQL/Catalog 与当前执行入口 |
| 文件与对象存储 | add-file-storage | [存储手册](../03-runbooks/storage.md)、相关 blob/files 实现 |
| CLI | add-cli-command | CLI/Core 用例与依赖边界，不加载平台身份/数据库资料 |
| 生命周期/日志 | app-lifecycle | [运行规范](../02-standards/runtime.md) |
| 构建/发行 | release-cross-platform | [发行](../03-runbooks/release.md)、[升级](../03-runbooks/updates.md) |
| 文档 | maintain-framework-docs | 本次受影响来源、导航、生成与链接检查 |
| 安全审查 | security-review | 本次入口、权限/状态边界与相关测试 |

跨任务硬约束以 [AGENTS](../../AGENTS.md) 为准。`framework.manifest.json` 和 [生成地图](context.gen.md) 是可选导航，不替代契约、代码或权威规范；Skill 正文只在对应任务加载。只有涉及重大选择时追加相关架构/ADR。

开发先查已有能力，复用领域/用例、AppClient、表单、布局、反馈和双语入口；API/DTO 改 OpenAPI 后生成，设置登记 Definition，迁移遵守原字节 checksum 与 Profile 边界。文件通过 file_id 与统一存储 port，业务代码不拼本地路径。

完成后运行 make docs、make test 和受影响检查；UI 用真实后端验证，原生修改在目标系统验证。区分代码存在、构建、自动化、目标系统实测和生产验证，只报告实际执行结果，不用历史通过数冒充当前结果。

长期有效的使用说明、开发规范、已知限制和重大 ADR 随实现更新。任务审查/验收报告、商业路线图、实验输出和本机记录放仓库外或 build/、CI artifact，不进入主仓库；确有测试消费者的夹具保留，不能因目录名像证据就删除。禁止保存密码、密钥、真实用户数据或整段会话历史。

中断交接使用 [任务模板](task-template.md)，记录目标、改动、失败/未执行检查与下一步，保存于任务会话或团队的仓库外工作区。提交、推送、外发消息、发行及生产操作按用户明确授权；Git 提交标题和正文用英文。
