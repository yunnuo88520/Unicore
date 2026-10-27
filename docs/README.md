<!-- Author: yunnuo <ymz@ebox.vip> -->
# Unicore 开发文档入口

Unicore 将需求、架构、契约、Skills 和验收记录一同维护。AI 从 [上下文地图](04-ai/context.gen.md) 开始，只加载当前任务需要的规范；代码和文档必须共同反映实际行为。

| 要解决的问题 | 入口 |
| --- | --- |
| 产品范围、各 profile 有什么 | [PRD](00-product/PRD.md)、[当前基础能力](04-ai/foundation-audit.md) |
| 模块边界与装配 | [架构](01-architecture/architecture.md)、[ADR](adr) |
| 修改接口或校验 | [OpenAPI](../packages/contracts/openapi.json)、[接口开发约定](02-standards/api-contract.md) |
| 修改页面、会话或表单 | [前端约定](02-standards/frontend.md)、[设计系统](02-standards/design-system.md) |
| 实例品牌上传与恢复 | [品牌需求](00-product/feature-branding.md)、[ADR-0009](adr/ADR-0009-runtime-branding.md)、[M3b 验收](04-ai/acceptance-m3b.md) |
| 文件、直传与对象存储 | [需求](00-product/feature-storage.md)、[ADR-0015](adr/ADR-0015-file-storage.md)、[配置/开发手册](03-runbooks/storage.md)、[验收](04-ai/acceptance-storage.md) |
| 管理端/用户端分离 | [ADR-0016](adr/ADR-0016-separate-client-admin-surfaces.md)、[当前验收](04-ai/acceptance-surfaces.md) |
| 用户、管理员权限及本地外观 | [角色需求](00-product/feature-roles.md)、[ADR-0014](adr/ADR-0014-separate-identities-management.md)、[管理验收](04-ai/acceptance-management.md) |
| 首次安装、连接测试与重启恢复 | [安装规范](00-product/feature-installation.md)、[ADR-0013](adr/ADR-0013-installation-experience.md)、[安装验收](04-ai/acceptance-installation.md) |
| 系统设置与授权/升级占位 | [设置需求](00-product/feature-settings.md)、[ADR-0010](adr/ADR-0010-settings-edition.md)、[设置验收](04-ai/acceptance-settings.md) |
| 修改配置、日志和生命周期 | [运行基座](02-standards/runtime.md)、[部署手册](03-runbooks/deployment.md) |
| 打包、统一版本与部署 | [发版流程](03-runbooks/release.md)、[部署手册](03-runbooks/deployment.md)、[部署验收](04-ai/acceptance-deployment.md) |
| 让 AI 实现功能 | [开发工作流](04-ai/development.md)、[Skill 导航](04-ai/context.gen.md)、[任务模板](04-ai/task-template.md) |

`make docs` 生成契约文档和 AI 上下文，`pnpm check:docs` 检查本地链接、命令、Skill 清单与生成漂移。`framework.manifest.json` 是机器可读的入口索引，不替代 OpenAPI、主题源或 ADR。
