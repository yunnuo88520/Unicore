<!-- Author: yunnuo <ymz@ebox.vip> -->
# 应用协作约定

按任务阅读 [开发入口](docs/product/development.md)，只加载相关代码与 Skill，不遍历历史资料。

1. domain/usecase 依赖向内，adapter 按 Profile 装配；CLI 不引入 HTTP、SQL 或平台身份。
2. API/DTO 以 OpenAPI 为源，pnpm generate 后不手改生成物；服务端执行权限与资源范围校验。
3. 共享 UI 同时中英文，复用布局、会话、请求、表单与消息；工作区固定 LTR。
4. 数据库变更先审当前执行器和兼容策略，不改已发布 SQL 字节，不改账本、不自动 DROP/reset；新世代 Catalog 不等于已切换运行时。
5. 先检查工作区，保护已有工作；手写源码保留作者头；新 Git 消息全英文。
6. 按影响运行 make docs、make test、Profile 构建与真实目标测试；区分自动测试、原生实测、生产验证。
7. 私钥、凭据、业务数据不入仓库。外发消息、公开发布和生产操作须明确授权，Skill 不新增授权。
