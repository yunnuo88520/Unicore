<!-- Author: yunnuo <ymz@ebox.vip> -->
# 系统更新需求

以两张共享卡片展示在线更新和版本日志，沿用全局主题、消息、弹窗和图标。日志优先读取内置和已缓存版本，在内网、断网和渠道失败时仍存在；页面加载不自动联网。用户手动检查、确认完成备份后才安装与重启，下载/准备/重启/完成/失败回滚有明确状态。

web-platform 只向有效管理员开放版本面板与更新 API，前后端同时控制；普通用户入口不展示版本与管理菜单。单机/原生 GUI 通过本机边界使用；CLI 不装配。Docker 支持检查和历史，由宿主机更新镜像。Tar/原生目录可写且实例数据外置时允许同迁移级别的签名更新；需要 DDL 的版本引导人工升级。

更新渠道、签名信任和安装器通过 ports 分离，默认 GitHub Releases，可替换自有 HTTPS feed/Provider；派生项目不得保留上游签名根。发行包要求 Ed25519 清单绑定应用/版本/平台/flags/迁移/摘要/期限，拒绝篡改、降级及不兼容目标。helper 在释放进程锁后原子切换，启动确认失败恢复旧程序，数据不被覆盖。

默认通过 GitHub Releases、自建站或内网文件服务器直接分发 Windows/macOS/Linux，不以官方商店上架为目标，不要求购买 OS 签名证书或 Apple 公证，也不要求消除首次安装拦截。Apple/Windows 平台签名为可选严格策略，开启 required 必须失败关闭；应用层 Ed25519、SHA-256、防降级、目标匹配和安全安装不得关闭。仓库和创建器均默认 allow_unsigned_platform=true；派生维护者可自行选择严格 OS 签名策略。内置 OTA 支持 GitHub/HTTPS，FTP 仅作为人工下载渠道。详见 [ADR-0018](../adr/ADR-0018-signed-updates.md)、[运行与发版](../03-runbooks/updates.md) 及 [支持范围](../support.md)。
