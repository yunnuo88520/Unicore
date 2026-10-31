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

package/release 重建 build/releases，先另存需要的旧产物。Web tar 包含 server、unicore-ops、web、deploy、许可证、用户文档、VERSION、CHANGELOG 和 manifest/checksums；CLI 包不含服务端数据库。原生 GUI 必须在目标 OS 构建和运行，交叉编译成功不能替代窗口/更新验证。Docker 跨架构需要 buildx/QEMU 或原生 builder。

Web 包根目录另提供 unicore、unicorehelp，帮助和配置生成见 [配置](configuration.md)。`make package-desktop` 在 macOS 额外生成 DMG，打开后将 app 拖到 Applications；Windows 额外生成可直接运行的 exe，不经过安装向导，需要 WebView2。Windows 单个 EXE 可直接使用；应用内安装更新仍要求完整发行目录中的 VERSION 等文件，单文件模式只支持查看/检查更新，见 [更新](updates.md)。Linux 桌面仍提供 tar.gz。三系统原有桌面 tar.gz 保留给 OTA，macOS/Windows 用户优先选择 DMG/EXE；同目录的目标专属校验和和 manifest 包含相应下载文件。DMG 通过系统 hdiutil 创建/校验；打包格式不改变 OS 签名状态，也不代表已经公证。

FEATURE_LICENSE 默认 false，FEATURE_UPDATER 默认 true；Make 将同一开关传给 Go 和前端。授权服务仍为占位。直接 go build 不等于已经装配 updater，使用一致的构建入口。

## 准备自己的新版本

持续维护 CHANGELOG 的 Unreleased；用 make version NEW_VERSION=x.y.z 同步版本和记录，审查生成结果后运行质量、安全、目标平台构建及升级恢复验证。该命令只做本地准备，不提交、不建标签、不发布镜像。对外发行按自己的仓库/渠道显式授权。

派生应用替换名称、Go module、bundle ID、品牌资产、联系方式与更新信任根；创建器会清空上游更新仓库和公钥，避免安装框架上游程序。当前创建器保持严格 OS 签名设置，免费无 OS 证书分发需明确配置 allow_unsigned_platform=true；应用层发布者签名等校验始终必需，见 [更新](updates.md)。

构建产物要验证 SHA-256、版本/目标平台与 manifest；不要上传实例数据、安装凭据或私钥。完整运行和回退步骤见 [部署](deployment.md)、[备份](backup.md)。
