---
name: add-platform-permission
description: 实现或扩展 Unicore web-platform 的服务端 RBAC 权限、角色映射和越权测试。
metadata:
  author: yunnuo <ymz@ebox.vip>
---

# add-platform-permission

## trigger

新增平台保护 API、角色或敏感操作；沿用 M2a 的 session/RBAC 和权限清单。

## inputs

资源:动作、API、最低角色、审计字段及已有 session/RBAC。

## steps

1. 阅读原始设计第 7 节、PRD 与身份 ADR。
2. 沿用 internal/platform 与 platformsql 的权限关系；新增点同步 docs/api/permissions.md、seed/迁移和安全验收。
3. 登记 users:read 等权限，服务端默认拒绝，逐 API 验证 session 和权限。
4. profile 隔离，桌面/CLI 不 import platform；敏感操作写脱敏审计。
5. 保护最后一个超级管理员，UI 只控制交互可见性。

## output

权限定义、后端校验、迁移、权限清单与正反向测试。

## forbidden

公开管理 API；任意 SSO claim 升管理员；仅依靠隐藏菜单；给非平台加用户表。

## validation

验证匿名 401、无权 403、授权成功、最后超管保护和非平台无路由；make test 与相关构建。
