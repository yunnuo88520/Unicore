<!-- Author: yunnuo <ymz@ebox.vip> -->
# 开发基座验收（2026-10-28）

> 本文保留该阶段的验收记录；系统更新、签名流程及其后续验证以 [更新验收](acceptance-updates.md) 为准，早期占位与未实现描述不再代表当前能力。

本轮以 6905ffe 为升级前基线，当前工作区实现见 [ADR-0017](../adr/ADR-0017-developer-kit-business-backup.md)。仍为0.1.0开发预览，没有发布正式 tag、Release 或镜像。MIT 由作者明确选择。

## 影响与实现清单

| 形态/模块 | 本轮变更 | 主要文件 |
| --- | --- | --- |
| web-platform | 普通用户/管理员各自隔离的笔记、本人文件附件、version 并发保护、事务审计 | internal/domain/note.go、internal/usecase/notes.go、internal/adapter/http/notes.go、notessql/repository.go |
| web-standalone | 同一笔记业务，local scope，无身份/云管理 | HTTP notes adapter、sqlstore/business.go |
| desktop | 共享笔记页面与 usecase、SQLite 持久化、Wails 原生桥接 | cmd/desktop/main.go、internal/adapter/desktop/notes.go |
| cli | 保持无 DB/平台依赖，原文本 Core 不变 | 边界检查与构建 |
| 数据库 | 独立 business_migrations=1，三方言 example_notes；旧 framework/platform checksum 不变 | migrations/{dialect}/business/0001_notes.sql |
| 唯一契约与 UI | 新增8个 notes operation，总计101；修复 title 业务属性被注释过滤的问题；共享弹窗与主题 | OpenAPI、contract-artifacts.mjs、sdk、notes-page.tsx/notes.css、validation-cases.json |
| 开发工具 | 源码导出/改名/module/bundle、provenance、doctor、开发依赖Compose、MIT | scripts/create-project.mjs、doctor.mjs、compose.dev.yaml、LICENSE |
| 运维与发布 | age 加密离线备份/校验/新目标恢复、随 Web tar 发运维工具；依赖扫描和候选来源证明 | cmd/ops、internal/maintenance、release.mjs、.github/workflows |
| AI / 文档 | 业务样板、上游三方合并、备份运行说明、manifest 与4个相关 Skills 同步 | docs/03-runbooks、framework.manifest.json、.agents/skills |

## 实测结果

本机 macOS arm64，Go1.26.10，直接 Node22.21.1，pnpm11.25.0；派生项目的 pnpm 脚本实际使用 Node26.7.0，也验证通过。Docker 为 Linux arm64。

| 验证 | 结果与范围 |
| --- | --- |
| make docs / make test | 通过：生成漂移、文档/作者/契约、profile依赖边界、vet/race、TS、36项 Vitest；另有创建器与版本准备的 Node 工具测试 |
| SQLite / PostgreSQL15 / MySQL8.0 | 真实独立测试库通过：旧平台迁移、业务账本重复执行、scope隔离、字面搜索、分页/排序、乐观锁、审计及 HTTP 身份/CSRF/附件拒绝；最后使用 race 复验 |
| 三数据库备份恢复 | 通过：停服锁、外置密钥、数据库原生快照、空目标库恢复、账号与笔记/私有文件校验、正常重启；拒绝非空库/既有目标/覆盖备份 |
| 归档安全 | 通过：错误密码、截断/损坏、解包限额、路径穿越、symlink、缺成员与伪造manifest；失败不发布目标目录 |
| MinIO 开发环境 | 真实云对象→加密快照→本地恢复通过，file_id及内容保留、默认local、旧云凭据/清理禁用，恢复不改原对象；只清理本轮专属前缀 |
| 笔记 PC / 375px | 4项真实 Web E2E 通过：弹窗创建/修改/删除、筛选、并发冲突、重启、本人附件、用户/admin隔离；浅深截图无页面横向溢出 |
| 全站回归 | 42项通过、6项可选环境测试跳过；真实 MinIO 备份另按上一行单独实测，没有把跳过项算通过 |
| macOS 原生 | 最终 make build-desktop 与品牌校验通过；真实 wails:// 窗口新建、更新、退出、同目录重启，笔记仍保留；无 HTTP 模拟 |
| 派生应用 | 实际导出 Atlas Demo / 新 Go module / 新 bundle，make install/docs/doctor/test/build-web/build-cli/build-ops 通过；不带Git历史、实例数据或env。修正了无Git时rg扫描依赖目录，以及新Node原生存储影响jsdom的问题 |
| 旧提交升级 / 恢复旧binary | make test-upgrade FROM_REF=6905ffe 通过：schema9/business0→business1、原账号/设置/实例密钥保留、笔记重启；升级前快照恢复到新目录并由旧binary成功运行 |
| 发行矩阵 | 10个tar：Linux双架构两种Web + 三系统双架构CLI；包含MIT、Web运维工具、同版本manifest/checksums和business级别 |
| 部署复验 | Tar平台+Nginx、Tar单机+Nginx、完整源码Dockerfile、Compose全部通过；PC1440/375首装、演示账号、六位图形验证码、受保护管理API拒绝匿名/普通用户、外观只本地、容器替换/密钥/账号/品牌持久化 |
| 依赖检查 | 生产入口 server/cli/ops 的 govulncheck 复扫可达漏洞0；pnpm生产依赖audit无已知漏洞。修复旧标准库、pgx、x/net、x/text、JOSE；仍有6个导入包/3个依赖模块的不可达通告，不能宣称所有依赖无漏洞 |

[手机笔记弹窗](evidence-developer-kit/note-mobile-dark.png) · [平台笔记与附件](evidence-developer-kit/notes-platform.png)。完整浏览器/部署证据在 build/acceptance/developer-kit 与 build/acceptance/deployment；升级JSON明确记录 from_revision、to_worktree 和迁移前后等级，不冒充跨正式语义版本发布。

## 运行与恢复边界

[笔记样板](../03-runbooks/business-example.md) · [备份操作](../03-runbooks/backup.md) · [派生与上游更新](../03-runbooks/framework-upgrade.md) · [发版](../03-runbooks/release.md)。业务迁移向前追加，不删除历史账本；回退使用匹配旧binary与升级前快照。MySQL DDL恢复失败可能留下部分目标库，必须弃用并使用新空库，不承诺事务回滚。云文件恢复到本地后需管理员重新配置/测试云位置，再显式迁移。

新提供的 devkey 对桶探测返回 Access Denied，因此本次真实 MinIO 验收使用先前已授权的开发管理员凭据。源码/文档/截图不存真实密钥。开发Compose的PG/MySQL/Mailpit已实际启动；本机拉取官方MinIO镜像失败，可设置可信 UNICORE_DEV_MINIO_IMAGE 或使用已有开发服务，不能把整套默认四容器称为本机全部启动成功。

Docker Hub鉴权超时、Go官方模块下载EOF后，完整Dockerfile成功使用 mirror.gcr.io 的 Go1.26.10/Node22 官方缓存和显式Go模块代理，保持sumdb与TLS校验。没有用预编译binary临时镜像替代源码构建。部署测试修正了双入口拆分后的约定：公开admin登录/bootstrap不属于受保护管理接口，用户登录后显式进入本地外观页。

基线提交 6bc8a00 的远端 [质量与构建](https://github.com/yunnuo88520/Unicore/actions/runs/40646114740) 全部通过：quality 包含隔离 PostgreSQL/MySQL 备份恢复、页面回归、功能裁剪和发行矩阵，另有 Docker 真实部署与三系统原生构建；[依赖扫描](https://github.com/yunnuo88520/Unicore/actions/runs/40646114812) 通过。该结果补齐了先前 Ubuntu runner 缺少 rg 的问题。10个本地tar已重建为6bc8a00并通过checksum，归档内macOS arm64 CLI实际运行确认同一版本与提交。本地最终镜像重建受npm连接重置影响失败，不能把此前带旧commit的镜像说成6bc8a00产物；同提交完整源码镜像与部署已有远端通过证据。

Windows/Linux原生窗口未实际运行；CI原生构建通过不代表窗口交互实测。其余架构CLI/amd64Web仅交叉编译。未操作宝塔面板/systemd主机或公网HTTPS生产部署。手动GitHub候选发布工作流未触发；正式系统签名/公证、镜像注册表推送、SBOM、独立授权服务、OTA、在线/增量备份/PITR仍未实现。
