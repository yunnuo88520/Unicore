<!-- Author: yunnuo <ymz@ebox.vip> -->
# Changelog

All notable changes to Unicore are documented here. 本文件只记录面向使用者的版本级变更；开发过程记录不在此保留。

## Unreleased

### 中文

- 修复 Platform 已有实例关闭笔记 demo 后无法保存菜单树的问题；保留原有模块菜单、自定义配置和角色授权，重新启用后继续使用，其他菜单仍可正常编辑。
- 修复 MySQL 库默认排序规则为 `utf8mb4_unicode_ci` 时 Platform 登录及个人安全数据关联失败的问题；通过追加迁移统一关联键并保留已有数据。包含此迁移的版本须停服备份后人工部署，回退使用匹配旧程序的完整快照。
- 修复派生应用模板遗漏追加迁移 SQL 及相关回归测试的问题，确保三系统桌面打包可校验完整 Catalog；分发检查直接验证导出产物的迁移与生成元数据。
- 升级间接 WebSocket 依赖至安全修复版本，修复客户端掩码密钥使用弱随机数的问题。

### English

- Fixed menu-tree saves on existing Platform instances after disabling the notes demo. Module menus, customizations, and role grants are retained for re-enabling, while other menus remain editable.
- Fixed Platform login and personal-security joins on MySQL databases using `utf8mb4_unicode_ci` by aligning association keys in an appended migration while retaining existing data. Deploy this migration with a stopped instance and a backup; rollback requires the matching old binary and a complete snapshot.
- Fixed missing appended migration SQL and related regression tests in derived application templates so desktop packaging can validate the complete catalog on all three operating systems. Distribution checks now validate migrations and generated metadata in the exported output.
- Upgraded the indirect WebSocket dependency to the security fix for weak randomness in client masking keys.

## 0.2.0 — 2026-11-22

### 中文

首个正式版本：三种产品形态（Platform、Standalone、CLI）、统一账号与显式授权、可注册业务工作台与派生项目体系的首发基线。

- **产品形态与装配**：Platform（web-platform）提供完整多租户管理面；Standalone 以 web-standalone 与 desktop 两个载体交付等效产品能力；CLI 独立提供无界面运维与业务命令。profile 是装配概念，不改变形态边界。
- **安装与生命周期**：安装向导（bootstrap 令牌门控、数据库校验、管理员初始化）覆盖 SQLite/PostgreSQL/MySQL；失败安装保持可恢复状态；数据目录含密钥、备份与账本，支持 `ops backup`/`restore` 与跨实例恢复。
- **统一账号与显式授权**：单一账号体系 + 多角色；权限点、operation 授权、菜单/动作授权与数据范围全部来自显式保存的角色授权并集（超级管理员保留集不可委派）；授权变更可撤销会话；登录/MFA/OIDC/个人令牌/API 令牌对与会话设备管理齐备。
- **业务工作台注册**：共享页面注册表 + `defineConsoles` 允许一个权限点进入多个工作台，工作台只决定呈现（侧栏/顶签外壳、子路由深链、切换时查询缓存隔离）；服务端资源授权按"权限点 + 数据范围 + 主体关系"由模块自行校验，前端输入一律不可信。
- **可移除参考业务与特性裁剪**：个人笔记作为完整三层参考实现（含附件、版本、管理面）；模块可按编译标签与目录裁剪，裁剪回归覆盖前后端装配与数据保留。
- **平台治理面**：用户/部门/岗位/角色、站点与安全设置、字典、公告（受众与已读）、审计日志、文件存储（多 provider、直传与签名下载）、监控快照与告警规则、计划任务、邮件模板与投递、MCP 能力治理（OAuth 客户端、授权、令牌族撤销）。
- **数据库与迁移**：Catalog 单轨执行器，分方言初始基线 + 追加式迁移、账本校验 fail-closed、迁移锁与世代锚点；已发行 SQL 字节冻结。
- **更新与分发**：tar 与 Docker 更新通道、签名清单与来源证明、桌面原生包（签名/公证可配置）、更新失败自动回滚与状态持久化、离线发行历史。
- **派生项目体系**：创建器生成带身份/作者/来源证明的可持续升级项目；framework-template 白名单同步（三方合并、冲突人工解决、备份分支）；升级/回退演练与派生项目回归在三平台 CI 运行。
- **工程门禁**：契约驱动生成（OpenAPI→SDK/UI/Go）、双语界面与 i18n 门禁、作者头与残留检查、依赖审计、跨平台 CI（ubuntu/macos/windows 原生矩阵 + Docker）。

### English

The first stable release: three product forms (Platform, Standalone, CLI), unified accounts with explicit authorization, registerable business consoles, and the derived-project system as the first-release baseline.

- **Product forms and assembly**: Platform (web-platform) ships the full multi-tenant management surface; Standalone delivers equivalent product capability through the web-standalone and desktop carriers; the CLI provides standalone headless operations. A profile is an assembly concept and does not move form boundaries.
- **Installation and lifecycle**: the install wizard (bootstrap-token gated, database verified, administrator initialized) covers SQLite/PostgreSQL/MySQL; failed installs stay recoverable; the data directory holds keys, backups and ledgers with `ops backup`/`restore` and cross-instance recovery.
- **Unified accounts and explicit authorization**: one account system with multiple roles; permission points, operation grants, menu/action grants and data scopes all come from explicitly saved role authorization unions (the super-administrator reserved set is non-delegable); authorization changes may revoke sessions; login/MFA/OIDC/personal tokens/API token pairs and session device management are complete.
- **Registerable business consoles**: the shared page registry plus `defineConsoles` lets one permission point enter several workbenches while the console decides presentation only (sidebar/top-tab shells, sub-route deep links, query-cache isolation on switch); server-side resource authorization is enforced per module as "permission point + data scope + subject relation", never trusting client input.
- **Removable reference business and feature trimming**: personal notes ship as the complete three-layer reference implementation (attachments, versions, management surface); modules trim by build tags and directories, with trimming regression covering assembly and data retention.
- **Platform governance surface**: users/departments/posts/roles, site and security settings, dictionaries, announcements (audiences and read state), audit logs, file storage (multiple providers, direct upload and signed downloads), monitor snapshots and alert rules, scheduled tasks, mail templates and delivery, MCP capability governance (OAuth clients, grants, token-family revocation).
- **Database and migrations**: the single-track catalog executor with per-dialect initial baselines and append-only migrations, checksum-verified ledgers failing closed, migration locks and generation anchors; distributed migration SQL is frozen from this release on.
- **Updates and distribution**: tar and Docker update channels, signed manifests and provenance, native desktop packages (configurable signing/notarization), automatic rollback with persisted state on failed updates, offline release history.
- **Derived-project system**: the creator generates a sustainably upgradable project with identity, authorship and provenance; framework-template whitelist sync (three-way merge, manual conflict resolution, backup branches); upgrade/rollback drills and derived-project regression run on three-platform CI.
- **Engineering gates**: contract-driven generation (OpenAPI→SDK/UI/Go), bilingual interfaces with an i18n gate, author-header and residue checks, dependency audit, cross-platform CI (ubuntu/macos/windows native matrix plus Docker).
