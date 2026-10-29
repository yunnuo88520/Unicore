<!-- Author: yunnuo <ymz@ebox.vip> -->
# 分片与断点续传验收

日期：2026-10-29。对应 [PR #16](https://github.com/yunnuo88520/Unicore/pull/16)，未发布或升级真实实例；远端最终构建结果以 PR 检查记录为准。

| 范围 | 行为与验证 |
| --- | --- |
| web-platform | 统一策略、持久分片、直传/本地流式、暂停/继续/放弃、权限与到期清理 |
| web-standalone / desktop / cli | 不装配文件或云设置；契约/依赖边界检查 |
| SQLite / MySQL 8.0 / PostgreSQL 15 | 专用空库迁移、旧版升级、幂等、文件会话重启/缺片恢复通过；平台 schema12，本地1/business2 |
| 本地 | Go race 验证重复片、长度错误、缺片、跨身份域、重启、合并后复制失败重试、完成后重放、到期清理 |
| MinIO | 用户提供的开发环境中随机前缀；实际 Chrome 直传、暂停/刷新/服务重启、错误文件、仅补第2/3片、逐字节下载、迁移通过；真实 abort 失败持久重试和旧签名重放通过 |
| 阿里云 OSS | 官方 SDK 实际两片上传、合并、条件复制与下载；Chrome PC/375px 三片暂停/刷新/重启续传与内容比对、中英文深色通过；修复全局 AdditionalHeaders 导致服务端请求无效、以及拒绝响应 Content-Type 覆盖的问题 |
| 腾讯云 COS / AWS S3 | COS 真实请求返回 AccessDenied，用户明确选择保留待验证；S3 没有真实 AWS 环境。两者只有 SDK/签名离线检查，不能声明云端通过 |
| tar / Docker / Compose | Linux arm64 平台/单机/CLI 三份本地归档构建通过；tar-platform、tar-standalone、Docker platform、Compose platform smoke 通过，9 MiB 两片文件经过 Nginx 上传/合并/下载摘要核对通过 |
| PC / 375px | 本地/MinIO/OSS 页面流程通过，浅色暂停、深色上传及英文策略/弹窗截图位于 build/acceptance/multipart/；同桶云测试串行，清理随机对象、未完成分片与本次临时 CORS Origin |

实现文件集中在 internal/blob/multipart.go、bloblocal/blobcloud adapter、internal/files/multipart.go、filesql、平台0012、HTTP storage.go、OpenAPI/生成SDK、FileUploadDialog 与 storage-page。设计见 [ADR-0022](../adr/ADR-0022-resumable-uploads.md)，设置/IAM/代理/恢复见 [存储手册](../03-runbooks/storage.md)。AI Skills 同步分片、权限、清理、双语和新schema边界。

配置默认100 MiB/8 MiB分片/并发3/24小时，可调整到协议上限64 GiB/5–64 MiB/1–6/1–168小时。测试文件以13 MiB（5 MiB×2+3 MiB）覆盖多片与续传，没有进行64 GiB满额性能压测。进度按确认分片推进；刷新后浏览器需重新选择原文件。云未完成会话不能通过普通对象备份复原，upload ID 不可用需重传；单实例data-dir锁仍然适用。

验证命令：make docs、make test（Go vet/race、契约/路由/权限/边界/作者/双语、47项前端测试）与 make build-web 通过。三方言会话测试、数据库旧迁移/幂等及安装重启测试在本轮临时 Docker 空库单独执行通过。最终 storage E2E 10 项通过、2 项 COS 跳过，同桶测试串行运行。部署测试镜像以本轮 Linux 二进制构建临时 runtime 镜像，没有重建完整多阶段官方 Dockerfile，未对外发布。真实 MinIO abort 失败后持久重试通过；OSS/COS/S3 签名测试绑定 uploadId/partNumber/长度且浏览器不设置禁止的 Content-Length 头。

合并前回归恢复上传弹窗的“移除已选文件”按钮，清空选择后禁用提交并将键盘焦点返回选择区；已有续传会话及分片保持。部署测试分别核验归档内置的 profile 默认值与通用 Docker 镜像的单机默认值，再显式选择本轮待安装形态。CI 使用官方多阶段 Dockerfile，并执行完整部署 smoke，不将本地 runtime 镜像验收等同官方构建。相关证据随 PR 的 browser-acceptance/deployment-evidence 归档。

未验证：64 GiB 满额与吞吐/并发压测，以及超过厂商单次复制限制的大对象分片复制分支；腾讯云补齐 IAM 后的完整云端链路；AWS 真实环境；本轮未改原生 Wails 桥接或桌面页面，未把 HTTP 验收算作桌面验收。跨 schema12 需匹配备份和人工部署，不自动更新现有实例。
