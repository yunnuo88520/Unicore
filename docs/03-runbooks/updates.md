<!-- Author: yunnuo <ymz@ebox.vip> -->
# 系统更新、发行签名与原生公证

当前实现见 [ADR-0018](../adr/ADR-0018-signed-updates.md)。在线更新必须有发行者 Ed25519 签名；文件摘要、GitHub 构建来源证明与操作系统签名分别承担不同的校验。现有 v0.1.1 资产未包含签名更新清单，不能作为 OTA 安装目标；本次接入不覆盖历史 Release。

| 形态 | 查看、检查 | 安装方式 |
| --- | --- | --- |
| web-platform | 管理员独立入口，后端 updates:read；普通用户/匿名拒绝 | Tar 管理员以 CSRF + updates:apply 确认备份后更新；Docker 外部替换镜像 |
| web-standalone | 无账号，本机 Host 与连接地址均须 loopback | 明确配置的 Tar 目录，helper 重启 |
| desktop | 原生桥接，共享更新页，无平台身份 | macOS app bundle / Windows exe / Linux 发行目录，helper 重启 |
| cli | 不装配 | 人工替换发行包 |

没有自动后台安装。打开页面先读取本机日志，不联系 GitHub；检查按钮才联网。CHANGELOG 数字版本生成 assets/updates/history.gen.json 并嵌入程序，远端成功记录缓存到私有数据目录 updates/catalog.json。断网、限流、签名不符均保留日志；在线日志只是文本，不能执行 HTML。FEATURE_UPDATER 默认为 true，FEATURE_LICENSE 默认为 false；关闭 updater 同时裁剪 Go 装配和前端功能，CLI 始终关闭。直接 go build 需要 -tags updater，建议使用 Make。

## 配置更新渠道

唯一构建入口为 assets/updates/config.json：repository、channel（stable/preview）、keys（key ID → Base64 原始 Ed25519 公钥）、allow_unsigned_platform。应用 ID 来自 assets/brand/identity.json。批准的默认策略是 GitHub Releases/自建 HTTPS 免费分发 Windows、macOS、Linux，不要求 Authenticode、Apple Developer ID 或公证；Ed25519、SHA-256、目标匹配、防降级和安全安装始终必需。OS 签名严格策略仅按需开启，不应自动随正式发行开启。

**当前已知限制：**仓库配置允许未做 OS 签名的包，`scripts/create-project.mjs` 却设为 false，其测试也断言 false；verify 与 installer/helper 使用该值，因此派生 Windows/macOS 更新可能被拒绝。修复需覆盖真实派生项目默认信任、OS未签名但发布者签名有效的包安装，以及无效应用签名拒绝。当前不能将免费分发目标描述为派生默认策略已通过；见 [支持范围](../support.md)。

运行环境可用 APP_UPDATE_REPOSITORY 替换公开 GitHub 仓库，APP_UPDATE_FEED_URL 指向自己的 HTTPS feed，APP_UPDATE_TRUST_FILE 指向同结构的受控公共配置文件；后者是部署操作者的信任设置，不由远端响应修改。私有 CA 渠道可通过 APP_UPDATE_CA_FILE 提供受控 PEM 根证书，追加系统信任且保持 TLS 校验；不提供跳过验证的选项。不要在 URL 填凭据。公开 GitHub 不需要 token；私有渠道可实现 internal/updates.Provider 并在 bootstrap/updating 装配。首次派生应用的创建器清空上游仓库和公钥，未配置时仍能显示内置日志，避免安装 Unicore 上游程序。

HTTPS feed 示例（资产必须同一 HTTPS host；GitHub adapter 另允许其下载 CDN）：

```json
{"releases":[{"version":"1.2.0","notes":"修复与改进","published_at":"2026-10-28T00:00:00Z","prerelease":false,"url":"https://updates.example.com/releases/1.2.0","assets":[{"name":"update-manifest.json","url":"https://updates.example.com/1.2.0/update-manifest.json"},{"name":"update-manifest.sig","url":"https://updates.example.com/1.2.0/update-manifest.sig"},{"name":"product-web-platform-linux-amd64-v1.2.0.tar.gz","url":"https://updates.example.com/1.2.0/product-web-platform-linux-amd64-v1.2.0.tar.gz"}]}]}
```

只接受严格递增数字 SemVer、相同 app/profile/OS/arch、功能 flags 与框架/业务迁移级别。签名过期、未知 key、包大小/摘要不符、路径穿越/链接/解包超限会拒绝安装。数据库结构变化的发行走人工停服备份升级，不能用程序回滚承诺数据库回滚。

## Tar 与 systemd

数据、配置和实例密钥必须放在安装目录外；安装目录与相邻 staging 必须同一文件系统、由受限服务用户可写。

```sh
APP_DEPLOYMENT_KIND=tar \
APP_DATA_DIR=/var/lib/unicore \
APP_UPDATE_INSTALL_DIR=/opt/unicore/current \
/opt/unicore/current/bin/server
```

解压完整包到 current，保留 VERSION 和 manifest.json；单个开发 binary、数据放包内、不可写的 /Applications 或 Windows Program Files 只允许检查。macOS 从完整 .app 运行，可通过 DMG 拖入 Applications；Windows 单个 EXE 可直接运行，但缺少 VERSION 时只允许查看/检查更新，安装更新仍需解压完整 tar 发行目录。Windows/Linux 的自动安装从完整桌面发行目录运行。Linux 需支持 renameat2(RENAME_EXCHANGE)，macOS 需 renamex_np(RENAME_SWAP)；不支持时拒绝切换并保留旧程序。

systemd 使用 deploy/tar/unicore.service 的 Restart=always、KillMode=process、APP_UPDATE_RESTART=supervisor。先让 unicore 用户拥有 /opt/unicore，再在服务的 ReadWritePaths 中显式开放 /opt/unicore，并在受控环境文件配置 APP_UPDATE_INSTALL_DIR；默认模板未授予安装目录写权限。helper 等待旧实例释放 instance.lock，supervisor 拉起新程序；未通过确认时新进程配合退出，helper 回退旧程序，supervisor 再启动。停服维护请先等待更新任务完成；避免在更新进行中强杀整个 cgroup。

Docker 仅显示日志和更新信息，即便存在可信包也不启用安装。先备份，由宿主机拉取新镜像、替换容器并检查健康；不挂 Docker socket，不在容器内覆盖 binary。

## 恢复与清理

任务状态在 data/updates/state.json，受限 plan/helper/archive 位于 updates/jobs/<随机ID>。签名校验后才切换；新程序必须确认 nonce、确切版本与实际 profile/功能开关/迁移级别，60 秒未确认或子进程退出则恢复旧程序。只有相同迁移级别才执行自动安装，更新过程不迁移数据库。数据目录解析符号链接后必须仍在安装目录之外。中断后启动 Guard 在打开数据库前恢复事务；签名已过期或备份损坏时停止自动恢复，按以下步骤人工处理。

停服并确认没有 helper 持有 updates/apply.lock 或实例锁后，读取 plan.json 的 root/new_root，结合 VERSION、manifest 与 state 确认哪份是旧包。Unix 原子交换保留旧包在安装父目录 .unicore-update-<任务ID>-*/ 下；Windows 保留 previous.exe 和元数据备份。保留数据目录，恢复已核对的完整旧包后启动、检查 ready 与登录。不要直接删除锁文件来绕过活跃锁。

成功任务删除下载归档，保留上一程序及诊断记录供人工恢复；目前不自动淘汰程序备份。磁盘不足时先停服并确认任务已 completed/rolled_back/failed，另存需要的备份，再只清理该任务 plan 指定的 staging 与 jobs 目录；不要批量删除 data 或任意未核对路径。失败日志不回传 secret。

## 发行者密钥与候选包

在受控电脑生成 key，私钥路径必须在仓库之外，文件以 0600 创建且拒绝覆盖：

```sh
node scripts/update-keygen.mjs /secure/offline/product-ota.pem product-2026
# 仅提交 assets/updates/config.json 的公钥。
# 经仓库维护者授权后，将 PEM 内容设置为 GitHub 加密 Secret：
gh secret set UNICORE_UPDATE_SIGNING_KEY --repo owner/repository < /secure/offline/product-ota.pem
```

私钥不进入源码、归档、日志、产物或运行实例。GitHub Secret 仅供手动候选流水线生成 update-manifest.json 与 update-manifest.sig；本地候选可通过安全环境注入同名变量。Prepare release candidate 校验完整同提交的 13 包矩阵，生成并自验签名，上传两份新清单资产与构建来源证明。缺密钥、key 不匹配、摘要不符均停止；不降级成未签名 OTA。公开 Release 需相同版本 tag、13 包、manifest/checksums 和这两份清单，仍需维护者明确发布授权。

公钥轮换先发布同时信任旧/新公钥的一版，再切换签名 Secret；最后在后续版本移除旧 key。已失效旧版如不能验证新 key，需要人工安装可信包，不能远端替换信任根。

## Apple 与 Windows 凭据

本项目当前没有 OS 开发者凭据，不能声称完成真实 Apple 公证或 Windows 签名；OS unsigned 不表示应用层 OTA 未签名，也不应被限制为只能预览分发。按需设置 GitHub repository variable UNICORE_PLATFORM_SIGNING=required 后，main 原生 CI 在打包前执行 scripts/platform-sign.mjs，签名失败或缺凭据会阻断。PR 不接触签名 Secret。无 OS 证书场景的当前创建器缺口见上节。

| 平台 | GitHub Secrets |
| --- | --- |
| macOS | MACOS_CERTIFICATE_P12（Base64 Developer ID Application p12）、MACOS_CERTIFICATE_PASSWORD、MACOS_SIGNING_IDENTITY、APPLE_NOTARY_KEY_P8（Base64 App Store Connect p8）、APPLE_NOTARY_KEY_ID、APPLE_NOTARY_ISSUER |
| Windows | WINDOWS_CERTIFICATE_PFX（Base64 代码签名 pfx）、WINDOWS_CERTIFICATE_PASSWORD |

macOS 使用临时 keychain，codesign hardened runtime + timestamp，notarytool submit --wait，stapler staple/validate，Gatekeeper 与 app ID 复验，最后删除临时 keychain/证书。Windows 使用 SDK signtool SHA256/RFC3161 时间戳与 verify /pa，临时 PFX 完成后删除；HSM/云签名需替换此适配脚本。Linux 没有这两类平台签名，仍必须通过 OTA 发行签名。打包脚本独立检查实际系统签名后记录 platform_signature，运行时如包声明系统签名也再次校验；不把环境变量直接当成功证明。

按当前提交、目标OS与部署方式分别记录检查结果；自动化与原生构建不替代完整更新和失败恢复。支持限制见 [支持范围](../support.md)。
