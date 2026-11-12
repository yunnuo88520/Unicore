<!-- Author: yunnuo <ymz@ebox.vip> -->
# 应用协作约定

按任务阅读 [开发入口](docs/product/development.md)，只加载相关代码与 Skill，不遍历历史资料。

疑似框架通用 Bug、准备反馈上游或同步框架源码时，读取 [framework-upstream](.agents/skills/framework-upstream/SKILL.md) 与[框架升级与反馈](docs/product/framework-upgrade.md)。先区分配置、业务和框架问题，再最小复现；本地临时补丁与业务改动分开，核对模板修复后同步并验证。仅有反馈草稿不能报告已提交上游。

1. domain/usecase 依赖向内，adapter 按 Profile 装配；CLI 不引入 HTTP、SQL 或平台身份。
2. API/DTO 以 OpenAPI 为源，pnpm generate 后不手改生成物；运行时按契约访问策略 fail-closed，未声明的已注册路由直接拒绝；服务端执行权限与资源范围校验。
3. 共享 UI 同时中英文，复用布局、会话、请求、表单与消息；工作区固定 LTR。
4. 数据库变更先审当前执行器和兼容策略，不改已发布 SQL 字节，不改账本、不自动 DROP/reset；新世代 Catalog 不等于已切换运行时。
5. 先检查工作区，保护已有工作；手写源码保留作者头；新 Git 消息全英文。
6. 按影响运行 make docs、make test、Profile 构建与真实目标测试；区分自动测试、原生实测、生产验证。
7. 私钥、凭据、业务数据不入仓库。外发消息、公开发布和生产操作须明确授权，Skill 不新增授权。
