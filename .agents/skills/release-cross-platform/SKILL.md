---
name: release-cross-platform
description: 构建 Unicore profile/OS/Arch 发行包、checksum/manifest 和原生桌面产物。
metadata:
  author: yunnuo <ymz@ebox.vip>
---

# release-cross-platform

## trigger

构建、校验或打包；本地构建不等于获准对外发布。

## inputs

版本/tag、profile/OS/Arch、渠道、签名来源和发布目的地。

## steps

1. 阅读 [发版手册](../../../docs/03-runbooks/release.md)、[部署手册](../../../docs/03-runbooks/deployment.md) 和 [部署验收](../../../docs/04-ai/acceptance-deployment.md)。VERSION 是唯一人工应用版本；用 make version NEW_VERSION=x.y.z 准备 Changelog 与生成投影，pnpm check:version 检查，禁止多处手改。执行 make docs、make test、UI 构建与 E2E。
2. make release 生成完整 Web/CLI 矩阵；make package RELEASE_TARGETS=linux/amd64 RELEASE_PROFILES=web-platform 可只出目标包。输出 build/releases 每次重建，先保存需保留的旧产物。核对 checksum、包内版本、manifest 和 Changelog。
3. GUI 各 OS 原生 runner 构建，记录实测 OS/Arch。
4. make docker-build / make compose-up 自动注入统一版本/metadata/flags；有本机架构两个 Web 包和同版本镜像后 make test-deploy 跑真实 Tar+Nginx、Docker/Compose 安装、验证码登录、重启及替换容器的持久化，保存 PC/375px 证据。只删除该脚本自己创建的随机测试资源，不复用真实数据。
5. GUI 各 OS 的原生运行与跨版本迁移/恢复另按任务验证；同版本重建不等于升级回滚。正式发布需外部签名及供应链校验，核对独立 Ed25519 update-manifest.json/.sig 与 platform_signature；签名/离线历史和 helper 已接入，具体边界见 ADR-0018。Docker 更新仅外部替换镜像，不覆盖自身 binary。

## output

产物、manifest/checksums、实测矩阵和发布说明；对外上传依用户明确授权。

## forbidden

未签名包声称安全在线升级；容器覆盖自身 binary 或默认 socket；未测声称全平台 GUI 可用。

## validation

真实 profile/version、checksum、原生运行及共享用例、CLI 依赖边界；正式发布需签名和恢复证据；读取 [更新手册](../../../docs/03-runbooks/updates.md)。OTA 私钥只通过已获授权的加密 Secret 配置，不能写入源码或产物；缺 key 的候选失败关闭。系统签名 required 缺开发者凭据须阻断，未真实公证不能声称已验收。

## 可裁剪授权与签名更新

FEATURE_LICENSE 默认 false、FEATURE_UPDATER 默认 true，Make 分别映射 Go tags 与 Vite 编译常量；两端必须一致。见 [设置规范](../../../docs/00-product/feature-settings.md) 和 [ADR-0010](../../../docs/adr/ADR-0010-settings-edition.md)。运行 make test-features 检查四组合：Go 参与文件、前端残留 chunk 清理/文本排除、features.json、真实 PC/375px 页面。授权保持占位；更新必须测试管理员 API、单机 loopback、离线历史、签名/兼容性、隔离升级与失败回滚。CLI 不装配 updatechannel/updateinstall；新增渠道通过 Provider port，不能绕过发行者签名。archive manifest 必须反映实际 flags；CLI 始终不装配。Docker 的 --build-arg 两阶段保持一致，make docker-build 统一注入；部署验收未覆盖的 feature/OS/Arch 组合明确记录。

开发基座：make doctor、make build-ops；Web tar 包含 MIT LICENSE 和 unicore-ops，manifest 带 business_migration_level。候选 workflow 只上传校验过的 artifact/来源证明，不创建 Release/tag/镜像。发布前执行依赖安全扫描并用备份恢复副本做跨版本验收；具体见 docs/03-runbooks/backup.md 与 framework-upgrade.md。
