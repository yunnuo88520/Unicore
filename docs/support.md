<!-- Author: yunnuo <ymz@ebox.vip> -->
# 支持范围与已知限制

Unicore 当前为 0.x 开发预览。下表说明代码提供的产品组合，不表示每个版本已经在全部操作系统、数据库或生产环境验收。当前提交的自动化结果查看 [CI](https://github.com/yunnuo88520/Unicore/actions/workflows/ci.yml)，使用前在目标环境验证。

| Profile | 数据库 | 身份与边界 | 主要入口 |
| --- | --- | --- | --- |
| web-platform | SQLite / PostgreSQL / MySQL；在线推荐后两者 | 统一账号、多角色、共享会话；工作台/API 分面，服务端授权 | cmd/server、apps/web |
| web-standalone | SQLite / PostgreSQL / MySQL | 无平台账号、管理端、邮件或云文件配置；远程使用需外层访问控制 | cmd/server |
| desktop | SQLite | 原生 Wails、本地业务与外观；无平台管理 | cmd/desktop、apps/desktop |
| cli | 无 | 直接调用 Core；不引入 SQL、HTTP 或 Wails | cmd/cli |

## 能力与限制

- 平台采用统一账号、多角色与共享会话；角色 realm 仅用于工作台分类。菜单、动作、API operation 分别授权，super_admin 保留集不可委派；部门数据范围不代替操作权限。业务资源范围由服务端确定，前端隐藏不构成授权。规则与排查见 [权限契约](api/permissions.md)。
- 平台存储提供本地、MinIO/S3、阿里云 OSS、腾讯云 COS 适配器。开发环境已验证本地、MinIO 和 OSS；COS 的云端写入/分片权限仍待验证，其他 S3 服务也要独立验证。64 GiB 是策略上限，不是满额性能压测承诺。
- 授权服务是可裁剪占位。OTA 有 GitHub/HTTPS 渠道、应用层签名和离线日志；Docker 更新由外部替换镜像。公开版本是否可作为 OTA 目标，以该 Release 的签名清单、可信公钥和验签结果为准；历史未签名版本不能补推定为已签名。GHCR 公开镜像（`ghcr.io/yunnuo88520/unicore`）随发行流程在 Release 发布时构建，历史已发布版本无镜像；以对应 Release 说明为准。
- 桌面以 GitHub、自建站或内网文件服务器直接分发为目标，不要求官方商店上架、付费 OS 证书或 Apple 公证，首次安装拦截不作为发版阻断项。仓库和创建器默认 allow_unsigned_platform=true；OTA 的 Ed25519 发布者签名、SHA-256、平台匹配、防降级与安全安装始终必需。详见 [更新手册](03-runbooks/updates.md)。
- 数据库安装与启动统一走 Catalog 单轨执行器（`migrations/runner`）：三个 namespace 各一份 `unicore_` 前缀终态基线，三方言齐备，重放幂等。历史 42+4 份 SQL 与旧执行器已删除；旧轨建立的 0.1.x 开发库不被接受（启动时明确拒绝，须重建）。PostgreSQL/MySQL 的真实实例执行路径仍以隔离 fixture 验收为准，不据此声明生产验证。见 [迁移开发规范](02-standards/database-migrations.md)。
- 桌面支持 Windows、macOS、Linux 的原生构建入口。构建成功、helper 测试、原生窗口启动和完整更新/失败恢复是不同检查，发行候选应在各目标系统分别完成；OS 证书签名/公证属于派生维护者按需选择的分发方式，不列为本项目验收条件。
- 开发环境测试与构建不构成生产可靠性认证。部署前验证安装、重启、权限、备份恢复和目标版本升级；回退使用匹配程序与完整备份，不能只覆盖旧 binary。

## 如何判断验证结果

| 证据 | 能说明什么 |
| --- | --- |
| 源码/配置存在 | 具备实现入口，仍需运行检查 |
| 构建通过 | 指定 Profile/OS/Arch 可构建，不证明原生窗口或部署可用 |
| 自动化测试通过 | 当前提交、实际执行环境与测试覆盖范围内通过 |
| 目标系统实测 | 对应 OS、数据库与操作流程验证通过，不推断其他组合 |
| 生产环境验证 | 需具体部署与恢复演练记录；本框架不作通用生产验证承诺 |

测试输出留在 CI artifact、build/ 或团队受控的仓库外存储。主仓库保留复用规范与实际测试夹具，不收录上游审查报告、阶段验收流水或本机工作区记录。

使用见 [指南](product/index.md)，开发见 [文档入口](README.md)，安全反馈见 [SECURITY](../SECURITY.md)。

## 首个稳定版的支持政策

当前仍为开发预览，以下政策从首个标为 stable、完成目标验收的 Release 生效；不追认旧预览库兼容。每个 Release 列出自己的实际 OS/架构、数据库版本和限制，源码中存在适配器不代表稳定支持。

首发优先验证 Linux Web（tar/systemd + Nginx 或外部 Docker/Compose）、SQLite、PostgreSQL 15、MySQL 8.0，以及 macOS arm64 本地桌面。Linux amd64/arm64 分别验收，桌面未通过窗口、重启和恢复检查的系统只列为实验目标。Windows/Linux 桌面、其他数据库版本、COS/其他 S3 服务和分布式/多副本部署不自动进入首发支持承诺。新开发体验推荐 SQLite；在线多用户部署推荐已验收的 PostgreSQL/MySQL。

| 边界 | 稳定版起的约定 |
| --- | --- |
| HTTP API 与 CLI | 同一 x.y 版本线的补丁保留已公开路径、必填输入和成功语义；允许新增可选字段。安全修复的必要破坏变更须在 Release 单独说明。不同版本线的变化提供迁移说明，不把内部 Go 包视为公开 API |
| 启动配置与安装数据 | 补丁保留已公开 flags/环境变量语义；废弃项先公告。私有安装文件、加密密钥与内部配置结构由程序管理，不作为手工编辑接口 |
| 数据库 | 已发布 SQL 原字节冻结，按 namespace 追加版本；支持的升级源与停机窗口逐版说明。回退恢复完整升级前快照和匹配程序，不提供 down SQL |
| 源码模板与 UI | 模板目录、内部 Go/React 组件与生成器不是稳定插件 ABI；框架升级通过源码合并，业务定制需处理冲突并重跑检查 |
| 运行形态 | 只承诺 Release 明示并通过验收的组合；CLI 无自身持久化，Standalone 无平台账号/云管理面 |
| 安全维护 | 仅最新稳定版本线接受安全修复，须先升级该线最新补丁；新稳定线发布后旧线停止维护，不承诺 SLA。细则见 SECURITY |

稳定版文档从对应 Release 的“使用与部署/支持范围”进入同一 tag 下的 Markdown；也可从仓库 Tags 选择 v<VERSION> 再打开 docs/README.md。tag 及其文档随版本保留，不把旧 tag 指向新提交。在线站点和 Wiki 随 main 更新，属于滚动文档；不能用它们替代旧版本的安装/配置说明。线上版本菜单提供发行记录入口。
