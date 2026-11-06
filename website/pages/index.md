---
# Author: yunnuo <ymz@ebox.vip>
layout: home
title: 一份核心，运行于每个终端
hero:
  name: Unicore
  text: 一份核心，<br>运行于每个终端。
  tagline: 用共享的 Go Core 与 React UI，构建 Web、原生桌面与 CLI 应用。从可运行的基座开始，把精力留给业务。
  image:
    light: /brand/mark.svg
    dark: /brand/mark-dark.svg
    alt: Unicore
  actions:
    - theme: brand
      text: 开始使用 →
      link: /product/index
    - theme: brand
      text: 部署到服务器
      link: /product/deployment
    - theme: alt
      text: 创建自己的应用
      link: /product/development
    - theme: alt
      text: GitHub
      link: https://github.com/yunnuo88520/Unicore
features:
  - title: 一个核心，四种形态
    details: Web 平台、Web 单机、Wails 桌面与 Cobra CLI 分别装配，共享领域与用例，保持各自的依赖边界。
    link: /product/build
    linkText: 选择与构建
  - title: 从完整样板开始
    details: 安装、平台身份、设置、文件存储与笔记业务样板，配合配置、备份和部署手册，帮助你接入自己的业务。
    link: /03-runbooks/business-example
    linkText: 阅读业务样板
  - title: 契约驱动的应用开发
    details: OpenAPI 作为 DTO 与 SDK 的唯一来源；Go 分层、共享前端和任务 Skill 提供人与 AI 都能遵循的开发约定。
    link: /02-standards/api-contract
    linkText: 查看开发规范
---
<!-- Author: yunnuo <ymz@ebox.vip> -->

## 从这里开始

| 你的目标 | 推荐入口 |
| --- | --- |
| 跑起来，了解支持边界 | [使用指南](../../docs/product/index.md) · [支持范围](../../docs/support.md) |
| 部署到服务器 | [从零部署](../../docs/product/deployment.md)（Docker / Compose / tar+systemd） · [常见问题](../../docs/product/faq.md) |
| 安装桌面与命令行 | [桌面与 CLI 安装](../../docs/product/install-desktop.md) · [备份恢复](../../docs/product/backup.md) |
| 开发自己的应用 | [创建项目](../../docs/product/development.md) · [业务样板](../../docs/03-runbooks/business-example.md) |
| 修改 API、页面和数据库 | [API 契约](../../docs/02-standards/api-contract.md) · [前端基础](../../docs/03-runbooks/frontend-foundations.md) · [迁移](../../docs/02-standards/database-migrations.md) |
| 安全与报告漏洞 | [安全策略](../../docs/product/security.md) |

::: info 当前开发文档
Unicore 目前为 0.x 开发预览。本站随仓库 main 的文档更新，可能包含尚未发行的改动；已发行版本请结合对应 tag 的文档和 Release 说明。详细手册主要为中文，英文入口提供独立的快速开始。
:::
