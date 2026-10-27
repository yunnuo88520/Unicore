---
name: add-api-operation
description: 增加或修改 Unicore OpenAPI operation、共享 DTO、SDK 与 HTTP 接口，并验证契约及服务端权限。
metadata:
  author: yunnuo <ymz@ebox.vip>
---

# add-api-operation

先阅读 docs/02-standards/api-contract.md 与 docs/api/permissions.md。以 packages/contracts/openapi.json 为唯一源声明 operationId、profile、权限/CSRF、输入约束、成功及错误响应，再运行 pnpm generate。

在 HTTP adapter 中装配业务并独立鉴权；SDK 通过生成的 operation 描述请求，不能让页面拼接口路径。平台仅管理员/普通用户两角色，管理业务 /api/v1/admin/*（包括只读）声明 superAdmin 并由服务端验证固定管理员；不可把全局配置读取作为普通用户能力，见 ADR-0012。CLI/Wails 只复用适用 DTO，不引入 HTTP 或平台依赖。校验约束由契约生成，业务不变量仍由 usecase/domain 执行。

运行 make test、make build-web 和相关 E2E，路由契约检查应覆盖真实 Chi 装配。更新接口规范及受影响运行说明。不要手改生成文件，不把新增权限只放在前端。

身份接口同时考虑两域：用户与管理员由固定 API 路径区分（管理员 /api/v1/admin/*），使用独立仓库/Cookie，不支持身份请求头选域；管理 actor 复核须查管理员表，目标用户/管理员由固定端点决定。不得因同邮箱合并、回退认证或恢复角色升降；见 ADR-0014。OIDC 两个固定 callback 分别验证各自 browser proof，管理员不 JIT。

当前形态与入口以 [ADR-0016](../../../docs/adr/ADR-0016-separate-client-admin-surfaces.md) 为准：用户 main.tsx 与管理员 admin.tsx 独立入口，管理页只在 admin-app.tsx 装配，共享 Workspace/表单/消息/主题。单机/桌面仅业务和本地外观，不提供站点、品牌、SMTP、对象存储和后台。管理员公开 auth/bootstrap 只返回固定域最小投影；本人 account 需管理员会话，其余管理资源须 permissions/superAdmin，不能宽泛豁免 admin 路由。新增普通用户立即 active 并验证用户入口登录；注册默认关闭，安全页 Switch 控制且须 SMTP 测试。布尔控件用 Switch，上传用自定义拖拽弹窗与 SDK 真实阶段。
