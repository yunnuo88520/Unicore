<!-- Author: yunnuo <ymz@ebox.vip> -->
# 支持范围与已知限制

Unicore 当前为 0.x 开发预览。下表说明代码提供的产品组合，不表示每个版本已经在全部操作系统、数据库或生产环境验收。当前提交的自动化结果查看 [CI](https://github.com/yunnuo88520/Unicore/actions/workflows/ci.yml)，使用前在目标环境验证。

| Profile | 数据库 | 身份与边界 | 主要入口 |
| --- | --- | --- | --- |
| web-platform | SQLite / PostgreSQL / MySQL；在线推荐后两者 | 管理员、普通用户分表；页面与 API 独立，服务端授权 | cmd/server、apps/web |
| web-standalone | SQLite / PostgreSQL / MySQL | 无平台账号、管理端、邮件或云文件配置；远程使用需外层访问控制 | cmd/server |
| desktop | SQLite | 原生 Wails、本地业务与外观；无平台管理 | cmd/desktop、apps/desktop |
| cli | 无 | 直接调用 Core；不引入 SQL、HTTP 或 Wails | cmd/cli |

## 能力与限制

- 平台权限当前固定为管理员/普通用户，不提供任意角色编辑或完整 SaaS 多租户。业务仍须校验身份域与数据归属，不能只隐藏菜单。
- 平台存储提供本地、MinIO/S3、阿里云 OSS、腾讯云 COS 适配器。开发环境已验证本地、MinIO 和 OSS；COS 的云端写入/分片权限仍待验证，其他 S3 服务也要独立验证。64 GiB 是策略上限，不是满额性能压测承诺。
- 授权服务是可裁剪占位。OTA 有 GitHub/HTTPS 渠道、应用层签名和离线日志；Docker 更新由外部替换镜像。公开版本是否可作为 OTA 目标，以该 Release 的签名清单、可信公钥和验签结果为准；历史未签名版本不能补推定为已签名。没有公开注册表镜像。
- 免费桌面分发的目标不要求购买 OS 证书或官方公证，Ed25519 发布者签名、SHA-256、平台匹配、防降级与安全安装始终必需。当前创建器仍将 allow_unsigned_platform 设为 false，与免费分发目标存在差异；派生 Windows/macOS OTA 不能因此视为已可用。详见 [更新手册](03-runbooks/updates.md)。
- 数据库新 Catalog/九份初始 SQL 已提供，应用安装和启动仍使用旧42份 SQL/旧执行器。新 namespace 账本及写前兼容保护尚未接入运行时；不能将新资产当成正式升级命令。见 [迁移开发规范](02-standards/database-migrations.md)。
- 桌面支持 Windows、macOS、Linux 的原生构建入口。构建成功、helper 测试、原生窗口启动和完整更新/失败恢复是不同检查，发行候选应在各目标系统分别完成；OS 证书签名/公证尚无真实凭据验收。
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
