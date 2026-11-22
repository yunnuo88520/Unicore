<!-- Author: yunnuo <ymz@ebox.vip> -->
# 开发与发版

应用版本唯一人工来源为根目录 VERSION（数字 SemVer：major.minor.patch）。其余 package.json、OpenAPI info.version、Wails productVersion、Go version.gen.go 都由 `pnpm version:sync` 生成；不能分别维护。开发 `go run` 也会显示该版本，Make/归档/镜像附加真实 commit 和 UTC 构建时间。包、镜像 tag、OCI label 和运行 bootstrap 使用同一 VERSION。`pnpm check:version` 是 CI 门禁。工具链依赖版本独立管理。

## 拿到仓库开发

需要 Go 1.26.11+、Node 22.22.2+（22 系列为 CI 基线；其他系列见 package.json 的 engines）、pnpm 11.25.0、Git 和 ripgrep（rg）。文档/作者检查依赖 rg，macOS 用 brew install ripgrep，Ubuntu/Debian 用 sudo apt-get install ripgrep，make doctor 会检查是否可用。质量和候选发布工作流显式安装该依赖，不依赖 runner 预装。Docker 验收另需 Docker Engine + Compose v2，桌面另需 Wails 原生依赖。

```sh
make install
make dev-server                       # 终端一，3000
make dev-web                          # 终端二，5173
make docs                             # 变更契约/设计/文档后生成
make test                             # 提交前质量门禁
make build-web && make test-e2e        # 独立实例 PC/375px 页面测试
```

新接口从 OpenAPI 开始，新模块/页面/设置读取仓库 `.agents/skills/` 对应任务。开发清单与扩展入口见 [AI 工作流](../04-ai/development.md) 和 [生成上下文](../04-ai/context.gen.md)。测试环境不复用真实数据或 SMTP。

## 裁剪笔记样板

默认发行物包含 Notes。使用 `FEATURE_NOTES=false make build-web`、`FEATURE_NOTES=false make build-desktop`、`FEATURE_NOTES=false make package` 或 `FEATURE_NOTES=false make docker-build` 构建不含笔记入口和业务实现依赖的产物；Compose 构建沿用该变量。开关必须同时传给前后端，勿仅手动重编译后端。系统设置与其他基础功能不受影响。`pnpm test:notes` 验证两种构建；已有表和迁移历史保留，恢复开启后继续使用。OTA 签名目标绑定裁剪状态，拒绝自动切换到另一种笔记配置。

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
# Compose 读取同一个 VERSION 并构建、启动，默认访问 127.0.0.1:3000
make compose-up
make compose-down
# 原生桌面，必须在对应系统构建
make build-desktop
# 原生构建后按当前 OS/Arch 打包（macOS 另出 DMG，Windows 另出便携 EXE）
make package-desktop
```

Windows 原生 CI 在构建后执行 scripts/test-windows-startup.ps1：使用随机临时数据目录，验证真实 Wails 窗口/页面、SQLite 初始化、再次启动以及失败弹窗；截图/可访问性文本为 windows-startup-evidence artifact。windows-exe artifact 另提供可直接验证的 exe，desktop-windows-latest 同时提供直接运行的版本化 exe、OTA tar 包、metadata 与目标专属校验和。macOS desktop artifact 同时提供 DMG（app + Applications 链接，可拖拽安装；scripts/dmg/background.svg 经 qlmanage/sips 渲染背景，Finder AppleScript 布置图标与窗口，自动化缺失时自动回退朴素布局并告警）、OTA tar 与 metadata；hdiutil 创建后校验镜像完整性。DMG 内 app 沿用原生系统签名状态，不因生成镜像而变成已公证。分支候选用于维护者验收，不能代替正式 Release。

### 桌面窗口关闭行为验证

桌面点关闭即隐藏到后台运行（[ADR-0048](../adr/ADR-0048-desktop-close-background-tray.md)）：macOS 点 Dock 图标或菜单栏托盘「打开」恢复、Cmd+Q / 托盘「退出」真正退出；Windows/Linux 托盘图标恢复，「退出」菜单真正退出。Windows 启动夹具只覆盖窗口启动，不覆盖关闭后台与托盘行为，须在目标系统人工补验：点关闭后进程仍存在、托盘恢复窗口、托盘退出结束进程且日志无 stop_failed。Linux 托盘依赖桌面环境提供 StatusNotifier/AppIndicator 支持（KDE、Ubuntu 默认可用；GNOME 需扩展或 snixembed 之类代理），无支持时托盘不可见属环境限制，须在发行说明如实记录。

CI 在原生 runner 打包后运行 `node scripts/check-release-entrypoints.mjs desktop`：macOS 只读挂载 DMG 并复制到临时 Applications 目录，Windows 核对下载 EXE 与原构建逐字节一致；Linux 质量 job 的 `node scripts/check-release-entrypoints.mjs web` 解包两个 Web profile，使用临时数据目录验证精确文件清单、统一入口的帮助/维护命令、配置生成/拒绝覆盖、无参数启动与 /install。均不使用真实实例数据。

### Windows 原生 OTA 验证

在 Windows/amd64 的交互式桌面会话中运行。需要 x64 Node.js、Go、Wails/CGO 原生构建依赖、WebView2 和 `tar`。先以默认特性构建当前 EXE（`FEATURE_LICENSE=false`、`FEATURE_UPDATER=true`、`FEATURE_NOTES=true`）；已有构建应与当前源码及 `VERSION` 一致。

```sh
make build-desktop
node scripts/test-native-update-windows.mjs
# 可选：通过 PowerShell UIAutomation 操作中文界面的更新流程
node scripts/test-native-update-windows.mjs --auto
```

脚本将当前 EXE 复制到随机临时安装目录，并用同一源码构建补丁版本加一的测试包，不修改仓库版本。数据、Ed25519 测试密钥、TLS 证书与 HTTPS 更新渠道均在该临时环境中生成。手动模式在打开的真实 Wails 窗口依次选择“系统更新 → 检查更新 → 更新并重启”，勾选备份确认并确认更新。

以 `data/updates/state.json` 的 `completed` 为通过条件，表示完成签名包验证、程序替换、重启和启动确认；`rolled_back` 或 `failed` 返回非零退出码。测试目录及 `native.log` 保留在终端输出的 `base` 路径，结束后关闭重启的应用，再删除该临时目录。该夹具覆盖相同迁移指纹的成功更新路径；失败恢复和 Authenticode 策略需另行验证。`--auto` 还依赖 PowerShell、可访问性树和中文界面，不能代替终态检查，也未纳入无人值守 CI。

### 发行包与镜像

每次 package/release 重建 `build/releases/`（先保存需要保留的旧产物），其中为 tar.gz、checksums.txt 和 manifest.json；各包只含单一应用入口、README.md 安装说明、LICENSE、VERSION 和 manifest.json；Web 另含 deploy/ 下两个 systemd/Nginx 模板。前端已嵌入二进制，不重复附带 web/、docs/、bin/ 或完整 CHANGELOG。scripts/release-layout.mjs 在打包时检查精确白名单。manifest 的 profile 是默认首装选择，安装向导仍允许选择两种 Web 形态；安装后固定。编译扩展统一传 `FEATURE_LICENSE=true FEATURE_UPDATER=true`，授权默认关闭并保持占位，更新默认开启并使用签名清单。

镜像不能下载官方源时，可显式替换同版本基础镜像来源，例如：

```sh
GO_IMAGE=mirror.gcr.io/library/golang:1.26.11-bookworm \
NODE_IMAGE=mirror.gcr.io/library/node:22-bookworm-slim make docker-build
```

Dockerfile 也允许 `RUNTIME_IMAGE`，替代镜像必须具备 nonroot 用户、CA 根证书、正确的 `/data` 卷所有权；自行改变基底须重新验收。直接 `docker build` 必须传 `--build-arg VERSION="$(cat VERSION)"`，不一致会失败；推荐 Make 入口。Compose 直接运行时先 `export UNICORE_VERSION="$(cat VERSION)" UNICORE_IMAGE="unicore:$(cat VERSION)"`。

## 双语文档与发布说明

中文 README.md 与 README.en.md 互相提供语言入口；功能、安装命令、支持边界及开发依赖变更须在同一 PR 更新两份。详细规范/手册目前主要中文，不能将 README 英译等同全站翻译。新脚本随派生白名单导出，创建器也生成中英文应用 README。

CHANGELOG.md 是版本变更的唯一说明源。新 Unreleased 非空时必须使用下列分区，条目按相同顺序逐条翻译；兼容性、安全修复、迁移/备份要求和未测边界不能只写一种语言。旧版历史不重写。

```md
## Unreleased

### 中文

- 说明用户可观察的变更、兼容影响与限制。

### English

- Describe the same user-visible change, compatibility impact, and limitations.
```

`make version NEW_VERSION=x.y.z` 在改版本前检查双语结构、非空和配对条目数量，拒绝缺语言或占位符；随后归档版本与 UTC 日期。`pnpm check:release-notes` 和 make test 检查当前版本说明、非空 Unreleased 与 README 互链。自动检查只保证结构，维护者仍须逐条审阅翻译语义。

候选工作流从相同提交的 Changelog 与已校验 manifest 生成 RELEASE_NOTES.md：中文/English 分区、实际下载文件和 OS/Arch、安装、备份/兼容/未测范围、系统签名状态、源码与 CI/候选链接、校验命令。说明只包含本版变更，不复制完整历史；其本身与所有候选资产纳入 GitHub 来源证明。候选不自动公开发布。获得发布授权后，创建草稿 prerelease，原样使用 `gh release create ... --notes-file <bundle>/RELEASE_NOTES.md`，上传该说明和已验证资产，检查草稿后转为公开 prerelease；不得改成 GitHub 自动生成的单语提交列表。发布后下载核对说明和 checksum/OTA 签名。

## 准备新版本

将用户能感知的变更持续写入 CHANGELOG 的 `## Unreleased`，历史已发布记录不改写。准备版本：

```sh
make version NEW_VERSION=x.y.z
# 自动提升 VERSION、生成全部投影、将 Unreleased 内容归档为带 UTC 日期的新版本
# 审阅变更，填写下一轮 Unreleased，执行质量和发行验证
make test
make build-web && make test-e2e
make release
make docker-build
make test-deploy
```

`make version` 是本地准备，不提交、不建 tag、不上传。不能降版本、重复准备版本、用空 Changelog 发版。发布前审阅源码与 Changelog、迁移兼容和停服备份方案，再本地提交；已有用户明确授权时才创建 `v<VERSION>` tag、推送源码/镜像或上传归档。CI 当前负责构建和上传任务内部 artifact，不创建公开 Release。需要自动发布时由维护者配置 registry/GitHub secrets、受保护 environment、Ed25519 发布者签名和发布审批。

## 发布验证与限制

```sh
pnpm exec playwright install chromium
# Docker daemon 对应 CPU 的两个 Linux Web 包 + 同版本镜像须先生成
make package RELEASE_TARGETS=linux/arm64 RELEASE_PROFILES=web-platform,web-standalone
make docker-build
make test-deploy
```

Linux amd64 daemon 将上例改为 linux/amd64。验收只创建随机命名容器/网络/卷，结束删除这些一次性资源；不会操作已有实例。包括 Tar 真二进制解包 + Nginx，Docker、Compose 的 `/install`、PC/375px 向导、演示账号、验证码、CSRF、动态品牌、安装锁、重启与替换容器后持久化，报告/截图位于 build/acceptance/deployment。CI 在 Ubuntu amd64 跑同一命令；以该次隔离运行的实际结果为准，输出不提交主仓库。

当前产物仍是开发预览：单包 manifest 的 `signature:null` 为保留字段，完整候选的 OTA 发行授权由 update-manifest.json/.sig 表示；platform_signature 独立记录系统签名。已有 checksum 不能替代 Ed25519 签名。真实授权服务仍未接入；公开版本的签名状态以实际 Release 资产和验签结果为准，OS 开发者凭据只用于可选严格策略，并非免费发行前提。仓库和创建器默认允许无 OS 证书的包，首次安装拦截消除及官方商店上架不属于发行验收；派生维护者可自行开启严格策略，见 [更新手册](updates.md)。`make test-deploy` 的同版本替换证明挂载和配置保留，不等于跨版本迁移回滚或生产恢复演练。跨版本 DDL 兼容仍按对应 ADR/迁移文档验收，不承诺替换旧 binary 就能回滚。报告该候选实际执行的检查与未测范围，输出存CI artifact或仓库外。

## 发布候选与恢复门禁

源码采用 MIT，各 tar 包包含 LICENSE；Web 的备份/恢复共用 unicore 入口，manifest 从 Catalog 生成 schema_generation、schema_fingerprint 与 namespace_versions。归档及默认镜像名读取根 package.name，VERSION 仍唯一版本源。派生项目构建前按 [上游约定](framework-upgrade.md) 保留 provenance 与作者。

提交 VERSION/CHANGELOG 并合入 main，等待 Quality and profile builds 与 Dependency security 全部成功，再手动运行 Prepare release candidate workflow，输入完全匹配的 version、该 main 质量 workflow 的 ci_run_id，以及可信的上一发布 tag 或提交（upgrade_from_ref，最近一个正式版本标签；0.1.x 实验标签不作为升级来源）。候选构建全 Web/CLI tar，合并同一提交的三系统原生桌面归档，校验 13 个 tar 包以及 macOS DMG、Windows 便携 EXE 的版本、来源提交、目标矩阵和 SHA-256；后两者记录在对应桌面 artifact 的 downloads 字段，统一进入 checksums.txt 与来源证明，OTA 清单仍只选择 tar；同时核对该 main 提交的 Dependency security 成功后，要求 GitHub Secret UNICORE_UPDATE_SIGNING_KEY 匹配已提交公钥，签发两份 OTA 清单，再生成 GitHub 构建来源证明，输出 release-bundle artifact。旧运行、PR 构建、不同提交、缺包或校验和不符均拒绝；不创建 tag/Release 或推送镜像。

### 跨版本升级门禁

候选工作流的独立 upgrade 任务按 SQLite、PostgreSQL、MySQL 三方言矩阵执行 `scripts/test-upgrade.mjs`：从 upgrade_from_ref 指定的旧提交构建真实旧程序，在专用数据库/数据目录安装 web-platform，创建设置、账号、业务记录与真实上传附件夹具，完整备份后升级到当前候选、重启核验，再把升级前快照恢复到隔离目录/专用空库并由旧 binary 复验。三个方言全部通过并产出 upgrade-<driver>.json 证据，bundle 才允许装配；任一方言失败或证据缺失即阻断候选。

脚本按旧源码树判定旧版能力：旧版存在的业务能力（如笔记、文件上传）升级与恢复后必须仍为 200，不再静默接受 404；`UPGRADE_FROM_REF` 解析到当前提交或与当前源码树同内容时直接拒绝，同版本重建不能冒充跨版本升级；备份世代不在冻结 Catalog（schema 1）内时明确报错，不兼容旧预览基线只能用匹配旧版恢复并按发行说明迁移数据。CI 在 main 推送时自动从最新发布 tag 执行同一演练（SQLite），使升级回归在候选前暴露。SQL 结果不泛化：每个方言的证据只覆盖该方言，外部数据库的原生 dump/restore 工具由对应容器或本机工具提供。

用户已授权公开发布时，下载该 artifact，验证 checksums/manifest 和 `gh attestation verify <文件> --repo <owner/repo>`，在完全相同的 main 提交创建 `v<VERSION>` tag，将 13 个 tar.gz、macOS DMG、Windows EXE、manifest.json、checksums.txt、update-manifest.json、update-manifest.sig 上传 GitHub Release（preview 勾选 prerelease，stable 不勾选）。发布说明列出实际 OS/Arch、安装入口、备份/恢复、未签名及未测范围；核对 Release 页面和下载后的 checksum 后才能宣告完成。首次预览沿用正常递增版本流程，不重写已归档 Changelog。必须验证独立 Ed25519 OTA 清单，而非依据保留字段 signature:null 判断签名。macOS/Windows 凭据配置、密钥轮换与缺凭据行为见 [更新手册](updates.md)；GHCR 镜像由 image workflow 在 Release 发布后单独构建，需核对其成功与对应 tag；SBOM 另行对接。

### 镜像浮动标签策略

镜像同时发布精确版本 tag（`<major.minor.patch>`）；只有 stable（非 prerelease）发布才推进 `major.minor` 浮动 tag，预览版与手动构建的候选镜像只写精确版本 tag，不覆盖稳定用户追踪的浮动引用。若需手动重推同版本镜像，workflow_dispatch 的 `promote_floating_tag` 默认 false，仅在补发 stable 同版本镜像时显式开启。宣告发布完成前，用 `node scripts/release-completeness.mjs --tag v<VERSION> --kind preview|stable` 核对下节身份链。

### 发布身份链与完成核对

一次发布的身份对应关系固定为：源码提交 SHA（tag `v<VERSION>` 指向的 main 提交）↔ 应用版本（VERSION，全部产物/镜像/manifest 一致）↔ 模板提交（framework-template 头提交的 `Source: <sha>` 尾行记录导出来源，模板继续随通过质量与安全检查的 main 滚动，不随 Release 单独出版本）↔ 候选运行（Prepare release candidate 的 ci_run_id 绑定同一提交的质量与安全结果）↔ Release 资产（checksums.txt 与来源证明）↔ 镜像 digest（GHCR 精确版本 tag；stable 另有浮动 tag）。

`node scripts/release-completeness.mjs --tag v<VERSION> --kind preview|stable [--bundle <candidate 目录>]` 逐项核对：tag/VERSION/提交一致、Release 公开状态与渠道标记、全部预期资产在列、下载资产逐个比对 checksums.txt、模板头提交含 `Source:` 尾行且发布提交是其祖先、GHCR 镜像 manifest 可查询（stable 同时核对浮动 tag）。任何一项 failed 或 unverified 都不得宣告发布完成；历史 Release 的既有缺口按记录保留，不回填旧 tag。来源证明复用候选 workflow 的 attest-build-provenance，用 `gh attestation verify` 核验，不重复实现。

Dependency security workflow 运行固定版 govulncheck：Web/CLI/ops 符号检查、全部业务导入包和桌面 bindings 导入包检查；前端审计包含开发依赖，low 及以上阻断。没有导入的废弃子包单独记录，不以排除开发依赖掩盖测试工具漏洞。安装新依赖需跟踪误报与升级影响，不静默忽略失败。发布前在目标环境恢复副本验证，参见 [备份恢复](backup.md)。跨版本升级/回退验收与同版本容器替换分开记录。

`make test-upgrade FROM_REF=<可信本地旧提交或tag>` 的流程是构建临时旧实例、保存设置/账号、备份、向前迁移、重启，再将升级前快照恢复到新目录供旧 binary 验证。仅允许当前脚本明确支持的旧业务等级，先核对旧包的迁移等级与备份元数据；SQLite 的结果不能泛化到 PostgreSQL/MySQL 或任意历史 ref，外部 DB 需对应跨版本夹具。失败时保留日志并阻断发布，不能把同版本重建当作升级/恢复通过。

构建网络受限时，可显式 `GOPROXY=https://goproxy.cn,direct make docker-build`（选用团队信任的 Go 模块代理，sumdb 校验保持启用），Compose 读取相同变量；GO_IMAGE/NODE_IMAGE/RUNTIME_IMAGE 同样可指定可信镜像源。不要使用跳过 TLS 或关闭 checksum 的方式解决下载问题。

## 正式版准备与兼容承诺

当前版本仍为开发预览，不因本流程存在而自动成为稳定版。候选 workflow 的 release_kind 默认 preview；正式发行选择 stable，控制双语发行说明。该 workflow 只准备 artifact，不创建 tag、不发布 Release、不部署；正式候选须先把 assets/updates/config.json 的 channel 改为 stable，重跑同提交的质量与原生构建；打包从该配置读取渠道，混合渠道拒绝装配，发行说明与包渠道不符也拒绝生成。发布时核对 GitHub prerelease 标记与文档版本入口一致。

首个正式版后冻结已交付迁移，后续在 namespace 追加连续版本；API/配置变更须给出兼容与迁移说明，不将 framework 源码结构或三方合并定制视为稳定插件 API。发布前明确该版本开始承诺的 API、配置与运行组合，写入对应 tag 的支持范围和 Release 说明；不要仅凭开发机结果承诺所有数据库、云厂商或原生系统。安全支持按仓库 SECURITY 政策。

正式版文档使用对应 tag 的固定来源；在线站点随 main 更新的内容属于开发文档，需明确标记。历史开发预览的 tag/资产保持，不为基线整合改写历史。旧开发库不要求原地升级；正常升级流程仍必须由带数据的追加迁移、重启和匹配快照恢复演练证明。当前三方言验证工具提供独立追加版本夹具；首个正式版本发布后还须用真实上一 tag 执行 make test-upgrade。
