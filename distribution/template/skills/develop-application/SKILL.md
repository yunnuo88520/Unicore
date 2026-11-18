---
name: develop-application
description: 修改派生应用的 Go 用例、API、React 页面或数据库设计时，按任务读取规范和验证跨 Profile 边界。
metadata:
  author: yunnuo <ymz@ebox.vip>
---

# develop-application

先读 docs/product/development.md 的相关小节和当次授权，检查工作区及已有功能。
开发中遇到疑似框架缺陷时转用 framework-upstream 的归属判断、复现、临时补丁与上游回流流程；无需等上游响应才完成已授权的本地修复。
只加载受影响代码、契约与必要测试；CLI 保持无数据库/传输依赖。
UI 同时中英文，复用统一请求、会话、布局、表单和消息。
新增菜单前按 [业务导航规划](../../../docs/product/development.md#业务导航规划) 确定归属、工作台、区域、父级和权限。业务管理页默认在用户工作台的业务区，必要时新建一级目录。只有需求明确指定时才给该业务页增加管理员工作台入口，归属仍为业务区。
API 权限在后端执行；文件通过 file_id/存储接口访问。
迁移先确认当前运行体系，不在普通任务切换新世代执行器或改已发布 SQL。
按影响验证 make docs/make test、目标 Profile/DB/原生运行，如实说明未测。
源码作者头与英文 Git 消息遵循 AGENTS；不保存凭据或擅自发布/操作生产。
