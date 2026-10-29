<!-- Author: yunnuo <ymz@ebox.vip> -->
# 开发与发版

应用版本唯一人工来源为根目录 VERSION（数字 SemVer：major.minor.patch）。其余 package.json、OpenAPI info.version、Wails productVersion、Go version.gen.go 都由 `pnpm version:sync` 生成；不能分别维护。开发 `go run` 也会显示该版本，Make/归档/镜像附加真实 commit 和 UTC 构建时间。包、镜像 tag、OCI label 和运行 bootstrap 使用同一 VERSION。`pnpm check:version` 是 CI 门禁。工具链依赖版本独立管理。

## 拿到仓库开发

需要 Go 1.26.10+、Node 22+、pnpm 11.25.0、Git 和 ripgrep（rg）。文档/作者检查依赖 rg，macOS 用 brew install ripgrep，Ubuntu/Debian 用 sudo apt-get install ripgrep，make doctor 会检查是否可用。质量和候选发布工作流显式安装该依赖，不依赖 runner 预装。Docker 验收另需 Docker Engine + Compose v2，桌面另需 Wails 原生依赖。

```sh
make install
make dev-server                       # 终端一，8080
make dev-web                          # 终端二，5173
make docs                             # 变更契约/设计/文档后生成
make test                             # 提交前质量门禁
make build-web && make test-e2e        # 独立实例 PC/375px 页面测试
```

新接口从 OpenAPI 开始，新模块/页面/设置读取仓库 `.agents/skills/` 对应任务。开发清单与扩展入口见 [AI 工作流](../04-ai/development.md) 和 [生成上下文](../04-ai/context.gen.md)。测试环境不复用真实数据或 SMTP。

## 快速构建

```sh
# 仅生成常见宝塔/Nginx服务器所需的一个包（改 arm64 适配 ARM）
make package RELEASE_TARGETS=linux/amd64 RELEASE_PROFILES=web-platform
# Linux 双模式 + 六个 OS/Arch CLI 的完整归档矩阵
make release
# 本机架构镜像，自动读取 VERSION，默认标签 unicore:<VERSION>
make docker-build
# 明确指定目标架构（需要 Docker buildx/QEMU 或原生 builder）
make docker-build DOCKER_PLATFORM=linux/amd64
# 私有仓库命名只构建本地镜像，不执行 push
make docker-build UNICORE_IMAGE=registry.example.com/team/unicore:preview
# Compose 读取同一个 VERSION 并构建、启动，默认访问 127.0.0.1:8088
make compose-up
make compose-down
# 原生桌面，必须在对应系统构建
make build-desktop
# 原生构建后按当前 OS/Arch 归档（保留 macOS app 和 Linux 执行权限）
make package-desktop
```

Windows 原生 CI 在构建后执行 scripts/test-windows-startup.ps1：使用随机临时数据目录，验证真实 Wails 窗口/页面、SQLite 初始化、再次启动以及失败弹窗；截图/可访问性文本为 windows-startup-evidence artifact。windows-exe artifact 另提供可直接验证的 exe，desktop-windows-latest 保留完整 tar 包与 metadata。分支候选用于维护者验收，不能代替正式 Release。

每次 package/release 重建 `build/releases/`（先保存需要保留的旧产物），其中为 tar.gz、checksums.txt 和 manifest.json；包内包含 VERSION、CHANGELOG、manifest、部署手册，Web 另含 bin/server、web/ 与 deploy/。manifest 的 profile 是默认首装选择，安装向导仍允许选择两种 Web 形态；安装后固定。编译扩展统一传 `FEATURE_LICENSE=true FEATURE_UPDATER=true`，授权默认关闭并保持占位，更新默认开启并使用签名清单。

镜像不能下载官方源时，可显式替换同版本基础镜像来源，例如：

```sh
GO_IMAGE=mirror.gcr.io/library/golang:1.26.10-bookworm \
NODE_IMAGE=mirror.gcr.io/library/node:22-bookworm-slim make docker-build
```

Dockerfile 也允许 `RUNTIME_IMAGE`，替代镜像必须具备 nonroot 用户、CA 根证书、正确的 `/data` 卷所有权；自行改变基底须重新验收。直接 `docker build` 必须传 `--build-arg VERSION="$(cat VERSION)"`，不一致会失败；推荐 Make 入口。Compose 直接运行时先 `export UNICORE_VERSION="$(cat VERSION)" UNICORE_IMAGE="unicore:$(cat VERSION)"`。

## 准备新版本

将用户能感知的变更持续写入 CHANGELOG 的 `## Unreleased`，历史已发布记录不改写。准备版本：

```sh
make version NEW_VERSION=0.1.1
# 自动提升 VERSION、生成全部投影、将 Unreleased 内容归档为带 UTC 日期的新版本
# 审阅变更，填写下一轮 Unreleased，执行质量和发行验证
make test
make build-web && make test-e2e
make release
make docker-build
make test-deploy
```

`make version` 是本地准备，不提交、不建 tag、不上传。不能降版本、重复准备版本、用空 Changelog 发版。发布前审阅源码与 Changelog、迁移兼容和停服备份方案，再本地提交；已有用户明确授权时才创建 `v<VERSION>` tag、推送源码/镜像或上传归档。CI 当前负责构建和上传任务内部 artifact，不创建公开 Release。需要自动发布时由维护者配置 registry/GitHub secrets、受保护 environment、外部签名和发布审批。

## 发布验证与限制

```sh
pnpm exec playwright install chromium
# Docker daemon 对应 CPU 的两个 Linux Web 包 + 同版本镜像须先生成
make package RELEASE_TARGETS=linux/arm64 RELEASE_PROFILES=web-platform,web-standalone
make docker-build
make test-deploy
```

Linux amd64 daemon 将上例改为 linux/amd64。验收只创建随机命名容器/网络/卷，结束删除这些一次性资源；不会操作已有实例。包括 Tar 真二进制解包 + Nginx，Docker、Compose 的 `/install`、PC/375px 向导、演示账号、验证码、CSRF、动态品牌、安装锁、重启与替换容器后持久化，报告/截图位于 build/acceptance/deployment。CI 在 Ubuntu amd64 跑同一命令；本机实测见 [部署验收](../04-ai/acceptance-deployment.md)。

当前产物仍是开发预览：单包 manifest 的 `signature:null` 为保留字段，完整候选的 OTA 发行授权由 update-manifest.json/.sig 表示；platform_signature 独立记录系统签名。已有 checksum 不能替代签名。真实授权服务仍未接入；OTA 签名和平台签名/公证流程见 [更新手册](updates.md)，真实开发者凭据与下一版公开签名发行仍待配置。`make test-deploy` 的同版本替换证明挂载和配置保留，不等于跨版本迁移回滚或生产恢复演练。跨版本 DDL 兼容仍按对应 ADR/迁移文档验收，不承诺替换旧 binary 就能回滚。

## 发布候选与恢复门禁

源码采用 MIT，各 tar 包包含 LICENSE；Web tar 同时包含 unicore-ops 和 business_migration_level。归档及默认镜像名读取根 package.name，VERSION 仍唯一版本源。派生项目构建前按 [上游约定](framework-upgrade.md) 保留 provenance 与作者。

提交 VERSION/CHANGELOG 并合入 main，等待 Quality and profile builds 与 Dependency security 全部成功，再手动运行 Prepare release candidate workflow，输入完全匹配的 version 和该 main 质量 workflow 的 ci_run_id。候选构建全 Web/CLI tar，合并同一提交的三系统原生桌面归档，校验 13 个包的版本、来源提交、目标矩阵和 SHA-256；要求 GitHub Secret UNICORE_UPDATE_SIGNING_KEY 匹配已提交公钥，签发两份 OTA 清单，再生成 GitHub 构建来源证明，输出 release-bundle artifact。旧运行、PR 构建、不同提交、缺包或校验和不符均拒绝；不创建 tag/Release 或推送镜像。

用户已授权公开发布时，下载该 artifact，验证 checksums/manifest 和 `gh attestation verify <tar.gz> --repo <owner/repo>`，在完全相同的 main 提交创建 `v<VERSION>` tag，将 13 个 tar.gz、manifest.json、checksums.txt、update-manifest.json、update-manifest.sig 上传 GitHub prerelease。发布说明列出实际 OS/Arch、安装入口、备份/恢复、未签名及未测范围；核对 Release 页面和下载后的 checksum 后才能宣告完成。首次预览沿用正常递增版本流程，不重写已归档 Changelog。必须验证独立 Ed25519 OTA 清单，而非依据保留字段 signature:null 判断签名。macOS/Windows 凭据配置、密钥轮换与缺凭据行为见 [更新手册](updates.md)；镜像注册表策略与 SBOM 另行对接。

Dependency security workflow 运行固定版 govulncheck：Web/CLI/ops 符号检查、全部业务导入包和桌面 bindings 导入包检查；前端审计包含开发依赖，low 及以上阻断。没有导入的废弃子包单独记录，不以排除开发依赖掩盖测试工具漏洞。安装新依赖需跟踪误报与升级影响，不静默忽略失败。发布前在目标环境恢复副本验证，参见 [备份恢复](backup.md)。跨版本升级/回退验收与同版本容器替换分开记录。

`make test-upgrade FROM_REF=<可信本地旧提交或tag>` 在临时实例构建旧 binary，安装/保存设置和账号，备份后用当前 binary 向前迁移业务账本，重启确认，再将升级前快照恢复到新目录并由旧 binary 验证。当前脚本针对 SQLite、旧平台 schema9/业务schema0 → 当前平台 schema12/业务schema2 的变更；其他历史版本/外部DB的跨版本升级需对应迁移夹具，不能泛化为任意版本可回退。

构建网络受限时，可显式 `GOPROXY=https://goproxy.cn,direct make docker-build`（选用团队信任的 Go 模块代理，sumdb 校验保持启用），Compose 读取相同变量；GO_IMAGE/NODE_IMAGE/RUNTIME_IMAGE 同样可指定可信镜像源。不要使用跳过 TLS 或关闭 checksum 的方式解决下载问题。
