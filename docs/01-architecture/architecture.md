<!-- Author: yunnuo <ymz@ebox.vip> -->
# 当前架构（M2a）

共享业务依赖链：`entry → adapter → usecase → domain`。`internal/contracts` 从 OpenAPI 生成；domain 无传输/DB/身份依赖。CLI 只调用 bootstrap.Core；Web 装配 install 与按安装 profile 初始化的平台身份；桌面只装配 bootstrap/local 的 SQLite 与 settings。

```text
React web-ui → AppClient → HTTP adapter → install / platform / settings
                      └→ Wails bridge → local settings
CLI / HTTP / Wails → usecase.Executor → domain.Analyze
                          ports → SQL adapter（仅实际需要的形态）
```

| 模块 | 责任 |
| --- | --- |
| internal/domain / usecase | 文本分析规则、context 与 DTO 映射 |
| internal/install | 安装状态/凭据/恢复、DB 配置加密、按 profile 装配 |
| internal/platform | Argon2id、会话、权限策略、限流/验证码与 identity ports |
| internal/settings | Definition 注册、类型/范围校验与持久化 port |
| internal/secret | AES-256-GCM 与受限密钥/原子配置文件 |
| adapter/storage/sqlstore | 无驱动/身份依赖的 SQL、迁移、设置与审计基础 |
| adapter/storage/platformsql | 平台身份 SQL 实现 |
| adapter/storage/sqlite / webdb | 桌面只 SQLite；Web 组合所有 DB 驱动 |
| bootstrap/local | 桌面自动 SQLite、进程锁、profile 校验，不 import platform |
| packages/contracts / sdk / web-ui | 唯一契约源、双 transport、共享界面 |

## 安装与迁移

`UNINITIALIZED → INSTALLING → INSTALLED`，失败为 INSTALL_FAILED。私有 data dir 使用跨平台 flock；token 只在文件/环境，API 不返回。准备操作先持久化 intent；只有确认空库并保存 schema ownership 后才迁移。外部已安装或非空数据库拒绝迁移，失败重试不能绕过此检查。DB 的 install_state 与默认设置/管理员同一事务提交。重启恢复以唯一 DB 安装标记和实例 ID 为依据；profile 与实例不匹配拒绝接管。

SQLite 使用 WAL、5 秒 busy timeout、单连接；PostgreSQL/MySQL 使用 bounded pool。分方言迁移嵌入二进制，版本 checksum 不可修改。SQLite/PostgreSQL DDL 事务；MySQL DDL 隐式提交，采用幂等 SQL，完全成功再记录版本。只创建本 profile 所需表；不自动回滚或 drop 数据。M2a 不承诺备份恢复工具已实现。

## 认证与 API

公开 bootstrap 仅返回脱敏基础信息；安装 token 不暴露。平台 bootstrap 只对有效 session 回传用户/权限与 CSRF token。服务器 session token 仅哈希入库，Cookie 为 HttpOnly/SameSite；Secure 根据受验证的 base_url 决定。写操作校验 same-origin 和会话派生 CSRF。API 权限见 [permissions](../api/permissions.md)。改变用户角色/禁用使旧 session 失效，最后超管规则在锁安装标记的事务内检查。登录按真实连接 IP/账号限流，不信任可伪造的 X-Forwarded-For；反代应另有边缘限流。

未知/不适用 API 返回 JSON 错误，绝不 SPA fallback。未安装业务页跳转 /install；安装后 /install 回到首页。默认后台 /admin，设置更新后旧默认路径 404，新路径承载同一 SPA，API 地址固定且权限不变。APP_ADMIN_PATH 可作恢复覆盖。

文本 Execute 平台需登录，其他形态直接调用相同 Core；最多 65,536 UTF-8 字节。词是 Unicode 空白分隔，行计数规范化 CRLF/CR，摘要基于原始字节。输入不写 DB/日志。HTTP body 有大小限制、拒绝未知字段与尾随 JSON。

## 界面与扩展

HttpTransport 管理 cookie/CSRF 与 WebClient；页面不直接 fetch。WailsTransport 只提供 bootstrap/execute/settings，没有 Web 身份/安装接口。TanStack Query 管理状态；DashboardWidgetRegistry 以唯一 id 扩展业务首页。平台仪表盘来自 DB：总用户、UTC 今日新增、过去 7 天成功认证的去重账号、最近审计。单机/桌面没有用户统计。

主题偏好 localStorage，持久实例默认主题在设置注册表；当前以设备偏好优先。UI hash 子页面复用到 Wails，Web 的 /install、/admin 与 /settings 入口由服务器处理。light/dark/system 与 375px 浏览器测试，表格可横向滚动但页面不溢出。

桌面入口 `desktop || bindings`；绑定生成用编译期标记跳过真实用户存储。代码不使用环境变量来绕过该边界。CLI、Core 与桌面依赖隔离在 scripts/check-boundaries 中按实际 Go 依赖图验证。
