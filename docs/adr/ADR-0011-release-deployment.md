<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0011：版本来源与部署入口

状态：接受 · 日期：2026-10-27 · 作者：yunnuo / ymz@ebox.vip

影响 web-platform、web-standalone、desktop 和 cli 的构建元数据；部署回归覆盖两种 Web。运行 API/数据结构和迁移不变。

VERSION 为唯一人工应用版本源。scripts/version.mjs 生成包元数据、OpenAPI info.version、Wails productVersion 和 Go 默认版本；check 模式阻止漂移。版本准备从 Unreleased 生成带日期 Changelog，不自动提交、打 tag 或对外发布。所有构建读取该源；Docker 显式参数必须匹配源，OCI label 与二进制同步。工具链版本不是应用版本。

Tar 分离 bin/web，Nginx 直接提供有指纹的 assets，页面入口/动态品牌/manifest/API 均交 Go，保持安装跳转、自定义后台路径和 docs 开关的统一行为。由 Go 提供 HTML 壳可以避免两个服务器重复维护安装状态和 SPA fallback；内嵌静态包仍允许单二进制运行。纯 CDN 托管 HTML 不属于当前模板。

Docker 非 root、只读根文件系统，数据目录独立持久卷。Compose 使用同一 Dockerfile 与版本输入，数据不进入镜像层。更新通过外部替换镜像保留卷；不挂载 Docker socket，不修改容器内二进制。停止宽限期须覆盖服务端请求排空时间。

验收使用真实 Linux 二进制/容器/Nginx 和浏览器页面，重启及同版本替换验证配置/密钥/数据库/图片保留；不声称宝塔面板、跨版本回滚、多架构运行或签名 OTA 已通过。正式上传、签名和生产部署仍需要对应授权。见 [运行](../03-runbooks/deployment.md)、[发版](../03-runbooks/release.md) 与 [验收](../04-ai/acceptance-deployment.md)。
