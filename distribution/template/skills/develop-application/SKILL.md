---
name: develop-application
description: 修改派生应用的 Go 用例、API、React 页面或数据库设计时，按任务读取规范和验证跨 Profile 边界。
metadata:
  author: yunnuo <ymz@ebox.vip>
---

# develop-application

先读 docs/product/development.md 的相关小节和当次授权，检查工作区及已有功能。
只加载受影响代码、契约与必要测试；CLI 保持无数据库/传输依赖。
UI 同时中英文，复用统一请求、会话、布局、表单和消息。
API 权限在后端执行；文件通过 file_id/存储接口访问。
迁移先确认当前运行体系，不在普通任务切换新世代执行器或改已发布 SQL。
按影响验证 make docs/make test、目标 Profile/DB/原生运行，如实说明未测。
源码作者头与英文 Git 消息遵循 AGENTS；不保存凭据或擅自发布/操作生产。
