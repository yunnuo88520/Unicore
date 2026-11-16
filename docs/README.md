<!-- Author: yunnuo <ymz@ebox.vip> -->
# Unicore 文档

Unicore 是用于构建 Web、原生桌面和命令行应用的 Go + React 框架。在线阅读请访问 [文档站](https://unicore.ebox.vip)。以下链接也可直接在仓库中阅读。

## 开始使用

从 [创建自己的应用](product/development.md) 开始开发，再按需 [裁剪示例](product/features.md)。想先体验参考应用，可以跟随 [快速开始](product/index.md) 在本机运行。

- [桌面与 CLI 安装](product/install-desktop.md)
- [从源码构建](product/build.md)
- [支持范围与兼容性](support.md)
- [常见问题](product/faq.md)

## 使用手册

- [框架能力与示例应用](product/workspace.md)
- [个人中心与账号安全](03-runbooks/personal-center.md)
- [语言与外观](03-runbooks/client-preferences.md)
- [公告与站内信](03-runbooks/announcements.md)
- [管理工具与角色授权](03-runbooks/admin-tools.md)
- [文件与对象存储](product/storage.md)
- [通知与邮件](product/notifications.md)

## 部署运维

- [Web 部署：Docker、Compose、tar/systemd](product/deployment.md)
- [配置参数](product/configuration.md)
- [备份恢复](product/backup.md)
- [应用更新](product/updates.md)
- [安全加固](product/security.md)

## 开发指南

按 [创建项目](product/development.md) → [裁剪示例与可选能力](product/features.md) 开始；[第一个功能](product/first-feature.md) 和 [笔记模块源码导读](03-runbooks/business-example.md) 是可选的示例教程，再按需要查阅：

| 任务 | 参考 |
| --- | --- |
| 新增接口、DTO 与 SDK | [API 契约](02-standards/api-contract.md) |
| 接入外部客户端或脚本 | [API 认证](product/api-authentication.md)、[MCP 接入](product/mcp.md) |
| 配置角色与资源访问 | [权限契约](api/permissions.md) |
| 新增页面、表单与双语文案 | [前端基础](03-runbooks/frontend-foundations.md)、[组件参考](product/ui-components.md)、[表单交互](product/form-interaction.md) |
| 组织 Go 业务代码 | [后端分层](02-standards/backend.md)、[架构](01-architecture/architecture.md) |
| 修改数据结构 | [数据库迁移](02-standards/database-migrations.md) |
| 修改产品名称、品牌与主题 | [产品身份](02-standards/product-identity.md)、[设计系统](02-standards/design-system.md) |
| 修改配置、日志与监控 | [运行基座](02-standards/runtime.md) |
| 同步框架源码 | [框架升级](product/framework-upgrade.md) |

## 贡献与维护

贡献代码从 [CONTRIBUTING](../CONTRIBUTING.md) 开始，问题反馈见 [SUPPORT](../SUPPORT.md)，漏洞报告见 [SECURITY](../SECURITY.md)。

仓库维护资料包括 [发行流程](03-runbooks/release.md)、[开源维护](03-runbooks/open-source.md)、[文档站维护](03-runbooks/documentation-site.md) 和 [Wiki 同步](wiki/README.md)。产品边界见 [产品形态规范](00-product/product-forms.md)，历史架构选择保存在 [ADR](adr)。

AI 编程助手的任务流程位于 [AI 开发工作流](04-ai/development.md) 与 `.agents/skills/`，协作约束见 [AGENTS](../AGENTS.md)。这些文件供贡献和维护任务使用，不进入文档站的用户指南。
