<!-- Author: yunnuo <ymz@ebox.vip> -->
# Changelog

## Unreleased — M2a（2026-10-26）

- Web 一次性凭据安装、空库/实例归属检查、崩溃恢复与 profile 固定。
- SQLite/PostgreSQL/MySQL 分方言嵌入迁移与真实数据库测试。
- Argon2id、服务端 session、CSRF、图形验证码、账号/IP 限流和后端 RBAC。
- 平台用户创建/搜索/分页/角色/启停、最后超管保护、真实统计与审计。
- SettingDefinition 注册设置、密文 DSN、站点/主题/安全/后台路径持久化。
- 桌面自动 SQLite 与本地设置，bindings 不触碰用户数据，CLI 依赖隔离继续通过。
- 独立实例 E2E、CI 外部 DB services，以及持久卷部署模板。

## 0.1.0 — 2026-10-26

- 建立 Go / pnpm monorepo 与 M1 profile 边界。
- 文本分析共享用例贯通 HTTP、原生 Wails 桥接和 CLI。
- 共享 React 工作台、实验室、三态主题与 375px 响应式。
- OpenAPI → Go / TypeScript 契约生成与一致性检查。
- 单测、跨入口测试、浏览器 E2E、依赖边界与作者检查、原生构建 CI。
- 开发版 tar / Docker 模板、跨平台预览包与 manifest；安装/身份/持久化/升级待后续里程碑。
