<!-- Author: yunnuo <ymz@ebox.vip> -->
# 文档入口

仓库入口提供 [简体中文 README](../README.md) 与 [English README](../README.en.md)，新版本 Changelog/Release 说明同步中英文；详细规范与手册目前主要为中文。

配套 VitePress 文档站的正式域名为 [unicore.ebox.vip](https://unicore.ebox.vip)，启用 DNS 与托管后提供统一导航和本地搜索。文档仍以仓库 Markdown 为来源，维护、版本策略与域名部署见 [文档站手册](03-runbooks/documentation-site.md)。

按需要选择入口；使用框架不需要阅读上游开发过程或全部架构决策。

## 使用与部署

| 目标 | 文档 |
| --- | --- |
| 安装、快速开始、选择形态 | [使用指南](product/index.md)、[支持范围与已知限制](support.md) |
| 配置参数、数据库、安全与邮件 | [配置说明与参数表](product/configuration.md)、[安装与恢复边界](03-runbooks/deployment.md) |
| 构建 Web、Desktop、CLI | [构建指南](product/build.md) |
| 从环境准备到 Web 上线：Docker、Compose、tar/systemd、HTTPS、安装向导 | [Web 从零部署指南](product/deployment.md) |
| 更新、签名与恢复 | [更新指南](product/updates.md)、[备份指南](product/backup.md) |
| 本地/云文件与大文件上传 | [存储指南](product/storage.md)、[详细配置](03-runbooks/storage.md) |
| 管理日志、邮件模板、定时任务与 XLSX | [管理工具](03-runbooks/admin-tools.md) |
| 公告、SSE 与本人站内信 | [公告与内容管理](03-runbooks/announcements.md) |
| 通知渠道、通知模板与事件接入 | [通知与邮件接入](product/notifications.md)、[事件通知细节](03-runbooks/notifications.md) |
| 小程序/App 的 Token 基础与用户 API 调用 | [客户端与 API 认证](product/api-authentication.md) |
| 个人资料、双重验证与登录设备 | [个人中心](03-runbooks/personal-center.md) |
| 语言、主题与本地外观 | [客户端偏好](03-runbooks/client-preferences.md) |

[用户 Wiki](https://github.com/yunnuo88520/Unicore/wiki) 单独生成，内容以当前已同步版本为准。

## 应用开发

按 [创建自己的应用](product/development.md) → [第一次体验](product/index.md) → [第一个功能](product/first-feature.md) 阅读；[笔记业务样板](03-runbooks/business-example.md) 用于定位源码。

| 任务 | 权威入口 |
| --- | --- |
| API、DTO、SDK、权限 | [API 约定](02-standards/api-contract.md)、[权限契约](api/permissions.md) |
| Go 领域、用例与数据层 | [后端规范](02-standards/backend.md)、[架构](01-architecture/architecture.md) |
| 页面、表单、主题、双语、图表与列设置 | [前端规范](02-standards/frontend.md)、[基础封装](03-runbooks/frontend-foundations.md)、[UI 参考](product/ui-components.md)、[设计系统](02-standards/design-system.md) |
| 数据库迁移 | [迁移规范](02-standards/database-migrations.md)、[目录状态](../migrations/README.md)、[开发库重建](03-runbooks/development-database-reset.md) |
| 配置、日志、生命周期与指标 | [运行基座](02-standards/runtime.md) |
| 产品身份、白标与环境变量 | [产品身份规范](02-standards/product-identity.md) |
| 创建项目、跟进上游 | [创建与合并](03-runbooks/framework-upgrade.md) |
| AI 协作 | [工作流与任务索引](04-ai/development.md)、[任务模板](04-ai/task-template.md) |

## 贡献与维护

贡献者阅读 [CONTRIBUTING](../CONTRIBUTING.md) 和 [代码规范](02-standards/coding.md)，按任务选择相关规范与 Skill。重大选择记录在 [ADR](adr)，产品目标见 [PRD](00-product/PRD.md)；这些不是每次开发的必读全集。新增或修改功能前先读 [产品形态与能力边界规范](00-product/product-forms.md)（三形态定义、能力矩阵与硬边界），功能盘点与呈现规则见 [功能适用性清单](00-product/feature-inventory.md) 与 [功能呈现与访问规范](00-product/feature-presentation.md)。

维护者按需查 [发行流程](03-runbooks/release.md)、[开源维护](03-runbooks/open-source.md) 和 [Wiki 同步](wiki/README.md)。真实支持状态看当前 CI 与目标环境检查；过程报告、实验快照和工作区记录不进入源码文档。

派生应用的创建、框架源码升级、冲突处理和通用问题反馈见[框架升级指南](product/framework-upgrade.md)。
