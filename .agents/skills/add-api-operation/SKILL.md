---
name: add-api-operation
description: 增加或修改 Unicore OpenAPI operation、共享 DTO、SDK 与 HTTP 接口，并验证契约及服务端权限。
metadata:
  author: yunnuo <ymz@ebox.vip>
---

# add-api-operation

先阅读 docs/02-standards/api-contract.md 与 docs/api/permissions.md。以 packages/contracts/openapi.json 为唯一源声明 operationId、profile、权限/CSRF、输入约束、成功及错误响应，再运行 pnpm generate。

在 HTTP adapter 中装配业务并独立鉴权；SDK 通过生成的 operation 描述请求，不能让页面拼接口路径。管理业务 /api/v1/admin/*（包括只读）按 x-unicore 声明 permissions（permissionMode all/any）与 superAdmin 保留集，由运行时策略中间件 fail-closed 强制；不可把全局配置读取作为普通用户能力，见 [ADR-0033](../../../docs/adr/ADR-0033-dynamic-user-roles.md)、[ADR-0034](../../../docs/adr/ADR-0034-administrator-restricted-roles.md)、[ADR-0036](../../../docs/adr/ADR-0036-navigation-regions-granular-authorization.md)。CLI/Wails 只复用适用 DTO，不引入 HTTP 或平台依赖。新增接口前先读 docs/00-product/product-forms.md 判定三种产品形态（Platform / Standalone 两载体 / CLI）的适用性与访问主体，非平台形态可达面以该规范与处理器 profile 自查为准。校验约束由契约生成，业务不变量仍由 usecase/domain 执行。

运行 make test、make build-web 和相关 E2E，路由契约检查应覆盖真实 Chi 装配。运行时策略中间件按 x-unicore fail-closed 执行：已注册路由缺少契约声明会直接 500（ROUTE_POLICY_UNDECLARED），路由↔契约双向遍历测试强制一致；session/authenticated 访问的 permissions/superAdmin 由中间件强制，handler 内 require 复用其会话并补充 2FA 注册与审计 actor。新增可委派 operation 会自动进入 `GET /admin/api-operations` 契约派生目录（认证、bootstrap、本人账号恢复等必要流程除外），角色经 operation_ids 收窄调用面；不要另建手写 API 目录。更新接口规范及受影响运行说明；功能或形态归属变化时同步 docs/00-product/feature-inventory.md 与 docs/00-product/feature-presentation.md。不要手改生成文件，不把新增权限只放在前端。

身份接口同时考虑两域：用户与管理员由固定 API 路径区分（管理员 /api/v1/admin/*），使用独立仓库/Cookie，不支持身份请求头选域；管理 actor 复核须查管理员表，目标用户/管理员由固定端点决定。不得因同邮箱合并、回退认证或恢复角色升降；见 ADR-0014。OIDC 两个固定 callback 分别验证各自 browser proof，管理员不 JIT。

当前形态与入口以 [ADR-0016](../../../docs/adr/ADR-0016-separate-client-admin-surfaces.md) 为准：用户 main.tsx 与管理员 admin.tsx 独立入口，管理页只在 admin-app.tsx 装配，共享 Workspace/表单/消息/主题。单机/桌面仅业务和本地外观，不提供站点、品牌、SMTP、对象存储和后台。管理员公开 auth/bootstrap 只返回固定域最小投影；本人 account 需管理员会话，其余管理资源须 permissions/superAdmin，不能宽泛豁免 admin 路由。新增普通用户立即 active 并验证用户入口登录；注册默认关闭，在注册设置用独立 Switch 控制开放注册与邮箱验证；仅邮箱验证、邮件登录和找回密码需要 SMTP 测试。布尔控件用 Switch，上传用自定义拖拽弹窗与 SDK 真实阶段。

接口/业务/数据层统一遵守 [后端规范](../../../docs/02-standards/backend.md)：固定身份域与最小投影，管理写事务重查管理员并与审计原子提交。公告用户 DTO 排除内部备注与草稿，详情每次重新鉴权；以 announcements_test.go 为完整权限矩阵样板。
