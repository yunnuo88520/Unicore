<!-- Author: yunnuo <ymz@ebox.vip> -->
# 更新渠道与安全升级

更新页先显示随程序内置的版本历史，用户点击检查才联网；断网/内网安装仍可阅读本机日志。远端记录缓存于私有数据目录。CLI 不装配更新；在线平台仅管理员可查看/操作，前后端均校验权限；单机 Web 需要 loopback。

默认渠道适配 GitHub Releases，也支持自有 HTTPS feed。派生项目必须使用自己的应用 ID、仓库/渠道和公钥，不能保留框架上游信任根。

| 配置 | 用途 |
| --- | --- |
| assets/updates/config.json | 构建时 repository、channel、keys、allow_unsigned_platform |
| APP_UPDATE_REPOSITORY | 运行时 GitHub owner/repository |
| APP_UPDATE_FEED_URL | 自有 HTTPS feed |
| APP_UPDATE_TRUST_FILE | 操作者配置的受控公钥/信任设置 |
| APP_UPDATE_CA_FILE | 私有 CA 根证书，仍校验 TLS |
| APP_UPDATE_INSTALL_DIR | tar 的完整安装根，数据必须在根外 |

不在渠道 URL 写凭据，不让远端响应修改信任根。自建渠道通过 Provider port 扩展，不能绕过验证。GitHub 公开仓库无需令牌。

## 必需签名与可选系统证书

应用自身的 Ed25519 发布者签名、SHA-256、目标 app/Profile/OS/arch/flags/迁移级别匹配、版本防降级、期限与安全安装校验始终必需。操作系统 Authenticode / Apple Developer ID / 公证是可选严格策略，不能用摘要代替发布者签名。

当前创建器将 allow_unsigned_platform 设为 false；没有 OS 证书而希望免费分发时，明确改为 true 并验证自己的无 OS 签名发行流程。此设置仅影响系统签名要求，不允许应用层无效签名。默认策略的统一仍未完成，不声称该问题已修复。

发布者私钥在仓库外安全生成和保管；代码/应用仅持有公钥。可使用 scripts/update-keygen.mjs 和 update-sign.mjs 准备自己的签名清单，先核对脚本参数和目标构建信息。缺 key/未知 key/签名无效时失败关闭，不能降级为 unsigned OTA。轮换公钥应先发布同时信任旧/新公钥的过渡版，再切换签名方；无法验证新 key 的旧版需人工可信安装。

## 安装和恢复

Tar 必须是带 VERSION/manifest 的完整包，安装与相邻 staging 同文件系统、受限服务用户可写，数据/密钥在安装根外。systemd 采用受控 supervisor 重启和适当目录权限，默认模板未开放安装根写入。

Desktop 采用完整 app/发行目录，检查实际系统权限。helper 等待实例锁释放、验证并原子切换，新程序需确认目标身份和版本；确认失败恢复旧程序。不要在更新中删锁或强杀 helper。自动安装仅支持相同数据库迁移级别；有 schema 变化时人工停服/备份升级，程序回滚不代表数据回滚。

Docker 只提供检查与日志，更新由宿主机替换镜像，不挂 socket、不在容器改写 binary。没有自动后台安装。无法确认更新状态时先停服并保留数据/诊断，使用可信完整旧包和匹配快照恢复，不批量删除不明 staging。

使用自己的渠道/目标系统进行签名拒绝、失败恢复与 [备份](backup.md) 演练。构建见 [构建指南](build.md)，操作部署见 [部署指南](deployment.md)。
