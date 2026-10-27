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
| 系统设置与授权/升级占位 | [设置需求](00-product/feature-settings.md)、[ADR-0010](adr/ADR-0010-settings-edition.md)、[设置验收](04-ai/acceptance-settings.md) |
| 修改配置、日志和生命周期 | [运行基座](02-standards/runtime.md)、[部署手册](03-runbooks/deployment.md) |
| 让 AI 实现功能 | [开发工作流](04-ai/development.md)、[Skill 导航](04-ai/context.gen.md)、[任务模板](04-ai/task-template.md) |

`make docs` 生成契约文档和 AI 上下文，`pnpm check:docs` 检查本地链接、命令、Skill 清单与生成漂移。`framework.manifest.json` 是机器可读的入口索引，不替代 OpenAPI、主题源或 ADR。
