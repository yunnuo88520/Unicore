---
name: add-api-operation
description: 增加或修改 Unicore OpenAPI operation、共享 DTO、SDK 与 HTTP 接口，并验证契约及服务端权限。
metadata:
  author: yunnuo <ymz@ebox.vip>
---

# add-api-operation

先阅读 docs/02-standards/api-contract.md 与 docs/api/permissions.md。以 packages/contracts/openapi.json 为唯一源声明 operationId、profile、权限/CSRF、输入约束、成功及错误响应，再运行 pnpm generate。

在 HTTP adapter 中装配业务并独立鉴权；SDK 通过生成的 operation 描述请求，不能让页面拼接口路径。CLI/Wails 只复用适用 DTO，不引入 HTTP 或平台依赖。校验约束由契约生成，业务不变量仍由 usecase/domain 执行。

运行 make test、make build-web 和相关 E2E，路由契约检查应覆盖真实 Chi 装配。更新接口规范及受影响运行说明。不要手改生成文件，不把新增权限只放在前端。
