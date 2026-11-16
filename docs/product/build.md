<!-- Author: yunnuo <ymz@ebox.vip> -->
# 从源码构建与版本

VERSION 是应用版本的唯一人工来源。package、OpenAPI、Wails 和 Go 版本投影由工具同步，不逐处手改；工具链版本独立管理。查看 package.json engines 和 make doctor，不使用随意降级依赖绕过安全检查。

```sh
make install
make docs
make test
make build-web
make build-cli
make build-ops
# 需要本系统 Wails/原生依赖
make build-desktop
```

make docs 生成契约、主题/品牌、迁移投影和开发索引；make test 执行质量检查，不代表全部 OS 原生实测或生产环境验证。CLI 可运行 make dev-cli ARGS='execute --text "Hello world"'。

## 构建归档和镜像

```sh
make package RELEASE_TARGETS=linux/amd64 RELEASE_PROFILES=web-platform
make package RELEASE_TARGETS=linux/arm64 RELEASE_PROFILES=web-standalone
make release
make docker-build
make docker-build DOCKER_PLATFORM=linux/amd64
make build-desktop
make package-desktop
```

package/release 重建 build/releases 和 build/staging，先另存需要的旧产物。所有用户包仅保留一个应用入口、README.md 安装说明、LICENSE、VERSION 与 manifest.json；Web 另含 deploy/ 下的 systemd 和 Nginx 模板。Web 前端已经嵌入可执行文件，不另附 web/、bin/、整套 docs/、完整 CHANGELOG 或帮助脚本。校验和位于归档外的 checksums.txt。CLI 不含服务端数据库。每次打包按精确文件白名单校验，意外文件会使打包失败。

Web 和 CLI 的根目录入口均为 unicore（Windows CLI 为 unicore.exe）；Web 的 help、config generate、backup/verify/restore 共用同一个二进制，帮助和配置见 [配置](configuration.md)。离线维护也可从源码 make build-ops 单独构建，业务 CLI 仍不连接数据库。原生 GUI 必须在目标 OS 构建和运行，交叉编译成功不能替代窗口/更新验证。Docker 跨架构需要 buildx/QEMU 或原生 builder。

`make package-desktop` 在 macOS 额外生成 DMG，打开后将 app 拖到 Applications；Windows 额外生成可直接运行的 exe，不经过安装向导，需要 WebView2。Windows 单个 EXE 可直接使用；应用内安装更新仍要求完整发行目录中的 VERSION 等文件，单文件模式只支持查看/检查更新，见 [更新](updates.md)。Linux 桌面仍提供 tar.gz。三系统原有桌面 tar.gz 保留给 OTA，macOS/Windows 用户优先选择 DMG/EXE；同目录的目标专属校验和和 manifest 包含相应下载文件。DMG 通过系统 hdiutil 创建/校验；打包格式不改变 OS 签名状态，也不代表已经公证。

构建开关由 Make 同时传给 Go 和前端。使用 `FEATURE_NOTES=false` 可关闭笔记 demo，`FEATURE_UPDATER=false` 可关闭应用内更新；完整开关、开发模式和发行包命令见 [功能裁剪](features.md)。

## 准备自己的新版本

在 CHANGELOG 的 Unreleased 中记录变更，使用 `make version NEW_VERSION=x.y.z` 同步版本和记录。检查生成结果，完成测试、目标平台构建和升级恢复验证后，再通过应用自己的仓库发布。版本命令只修改本地文件，标签、安装包和镜像需另行发布。

派生应用替换名称、Go module、bundle ID、品牌资产、联系方式与更新信任根；创建器会清空上游更新仓库和公钥，避免安装框架上游程序。创建器默认设置 allow_unsigned_platform=true，允许无 OS 证书分发；应用层发布者签名等校验始终必需，见 [更新](updates.md)。

构建产物要验证 SHA-256、版本/目标平台与 manifest；不要上传实例数据、安装凭据或私钥。完整运行和回退步骤见 [部署](deployment.md)、[备份](backup.md)。
