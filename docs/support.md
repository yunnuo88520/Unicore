<!-- Author: yunnuo <ymz@ebox.vip> -->
# 支持与兼容性

Unicore 当前为 0.x 开发预览。选择安装包时，请以对应 [Release](https://github.com/yunnuo88520/Unicore/releases) 列出的操作系统、架构、数据库版本和已知问题为准。源码的自动化结果可查看 [CI](https://github.com/yunnuo88520/Unicore/actions/workflows/ci.yml)。

## 产品形态

| 形态 | 载体 / profile | 数据库 | 访问方式 |
| --- | --- | --- | --- |
| Platform | Web / `web-platform` | SQLite、PostgreSQL、MySQL | 统一账号、多角色；用户与管理工作台共用会话 |
| Standalone | Web / `web-standalone` | SQLite、PostgreSQL、MySQL | 无平台账号；远程使用需外层访问控制 |
| Standalone | Wails 桌面 / `desktop` | 本地 SQLite | 本地原生应用，无平台管理后台 |
| CLI | 命令行 / `cli` | 无 | 直接调用 Core，无自身持久化 |

Standalone 的 Web 与桌面提供相同的业务功能。载体差异包括初始化方式、文件下载对话框和更新安装方式。Web 在安装时确定 profile，安装后不能切换。

## 运行环境

- **Web**：提供 tar 和 Docker 部署。在线多用户应用推荐 PostgreSQL 或 MySQL；本机试用可选 SQLite。部署步骤以 PostgreSQL 15、MySQL 8.0 为示例。
- **桌面**：提供 Windows、macOS、Linux 的原生构建入口。需要对应系统的 WebView 和 Wails 依赖，安装包及原生窗口验证范围见对应 Release。
- **浏览器**：面向现代常青浏览器，不支持 IE 和旧版 Edge。界面提供中英文，布局固定从左到右。
- **源码工具链**：Go 1.26.11+，Node.js 与 pnpm 范围见 [package.json](../package.json)。`make doctor` 可检查本机环境。

## 部署限制

当前按单实例运行：一个应用进程连接一个数据库。SSE、限流及部分后台状态保存在进程内存中，暂不支持直接部署多个共享数据库的副本。

Standalone 不提供账号认证、角色管理或平台云存储配置。远程部署时，应在反向代理、VPN 或网络层限制访问。

存储适配器覆盖本地、MinIO/S3、阿里云 OSS 和腾讯云 COS。已有开发验证覆盖本地、MinIO 与 OSS；COS 及其他 S3 服务仍需在目标环境验证权限、CORS 和分片上传。64 GiB 是上传策略上限，实际容量与性能取决于部署和存储环境。

商业授权服务为预留能力，尚无完整实现。

## 更新与数据兼容

0.x 预览版本可能更换数据库基线，旧开发库不能保证直接升级。迁移执行器会校验数据库世代、版本和 SQL checksum；遇到不兼容时，应使用匹配版本恢复到隔离环境，按发行说明迁移数据。

自动更新要求有效的发布者签名、目标平台和构建特性匹配，以及相同数据库迁移指纹。涉及数据库结构变更时，需人工停服、备份并升级。Docker 更新通过外部替换镜像完成；CLI 没有内置更新页。见 [更新指南](product/updates.md)。

Windows/amd64 原生桌面已通过同一迁移指纹、默认构建特性下的 OTA 实测，覆盖 HTTPS 测试渠道、Ed25519 签名包验证、EXE 替换、重启与启动确认。此项结果覆盖升级成功路径；Windows 失败恢复、其他架构及 Authenticode 策略仍需分别验证。

桌面系统签名和 Apple 公证为可选分发策略，状态见对应 Release；应用 OTA 始终验证 Ed25519 发布者签名。备份应成套保存数据库、文件、私有配置和密钥，恢复步骤见 [备份指南](product/backup.md)。

## 文档版本

在线文档和 Wiki 随 `main` 更新，可能包含尚未发行的变更。阅读已安装版本的说明时，从对应 Release 进入 Git tag 下的文档，不以在线配置表替代旧版本说明。

安全维护范围与私密报告入口见 [安全策略](../SECURITY.md)。源码合并和内部组件目前不提供稳定插件 ABI，派生项目升级采用 [Git 三方合并](product/framework-upgrade.md)。
