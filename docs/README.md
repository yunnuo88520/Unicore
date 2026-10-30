<!-- Author: yunnuo <ymz@ebox.vip> -->
# 文档入口

按需要选择入口；使用框架不需要阅读上游开发过程或全部架构决策。

## 使用与部署

| 目标 | 文档 |
| --- | --- |
| 安装、快速开始、选择形态 | [使用指南](product/index.md)、[支持范围与已知限制](support.md) |
| 配置数据库、安全与邮件 | [配置](product/configuration.md)、[安装与故障处理](03-runbooks/deployment.md) |
| 构建 Web、Desktop、CLI | [构建指南](product/build.md) |
| tar、Nginx、Docker/Compose | [部署指南](product/deployment.md) |
| 更新、签名与恢复 | [更新指南](product/updates.md)、[备份指南](product/backup.md) |
| 本地/云文件与大文件上传 | [存储指南](product/storage.md)、[详细配置](03-runbooks/storage.md) |
| 管理日志、邮件模板与公告 | [管理工具](03-runbooks/admin-tools.md)、[公告](03-runbooks/announcements.md) |
| 语言、主题与本地外观 | [客户端偏好](03-runbooks/client-preferences.md) |

[用户 Wiki](https://github.com/yunnuo88520/Unicore/wiki) 单独生成，内容以当前已同步版本为准。

## 应用开发

从 [应用开发指南](product/development.md) 和 [笔记业务样板](03-runbooks/business-example.md) 开始。

| 任务 | 权威入口 |
| --- | --- |
| API、DTO、SDK、权限 | [API 约定](02-standards/api-contract.md)、[权限契约](api/permissions.md) |
| Go 领域、用例与数据层 | [后端规范](02-standards/backend.md)、[架构](01-architecture/architecture.md) |
| 页面、表单、主题与双语 | [前端规范](02-standards/frontend.md)、[基础封装](03-runbooks/frontend-foundations.md)、[设计系统](02-standards/design-system.md) |
| 数据库迁移 | [迁移规范](02-standards/database-migrations.md)、[目录状态](../migrations/README.md)、[开发库重建](03-runbooks/development-database-reset.md) |
| 配置、日志、生命周期与指标 | [运行基座](02-standards/runtime.md) |
| 创建项目、跟进上游 | [创建与合并](03-runbooks/framework-upgrade.md) |
| AI 协作 | [工作流与任务索引](04-ai/development.md)、[任务模板](04-ai/task-template.md) |

## 贡献与维护

贡献者阅读 [CONTRIBUTING](../CONTRIBUTING.md) 和 [代码规范](02-standards/coding.md)，按任务选择相关规范与 Skill。重大选择记录在 [ADR](adr)，产品目标见 [PRD](00-product/PRD.md)；这些不是每次开发的必读全集。

维护者按需查 [发行流程](03-runbooks/release.md)、[开源维护](03-runbooks/open-source.md) 和 [Wiki 同步](wiki/README.md)。真实支持状态看当前 CI 与目标环境检查；过程报告、实验快照和工作区记录不进入源码文档。
