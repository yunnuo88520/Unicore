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

1. 阅读部署手册和阶段验收，核对 VERSION/包版本，make test、UI 构建和 E2E。
2. make release 生成 Linux 双模式 Web 与三系统双架构 CLI，核对 sha256、元信息和解压运行。
3. GUI 各 OS 原生 runner 构建，记录实测 OS/Arch。
4. 正式发布需外部签名及供应链校验；M2a signature:null 只能标开发预览。
5. tar 受限外部升级器与 Docker 镜像替换分别验证，数据外置，恢复演练用隔离环境。

## output

产物、manifest/checksums、实测矩阵和发布说明；对外上传依用户明确授权。

## forbidden

未签名包声称安全在线升级；容器覆盖自身 binary 或默认 socket；未测声称全平台 GUI 可用。

## validation

真实 profile/version、checksum、原生运行及共享用例、CLI 依赖边界；正式发布需签名和恢复证据。

## 可裁剪授权/升级占位

FEATURE_LICENSE / FEATURE_UPDATER 默认 false，Make 分别映射 Go tags 与 Vite 编译常量；两端必须一致。见 [设置规范](../../../docs/00-product/feature-settings.md) 和 [ADR-0010](../../../docs/adr/ADR-0010-settings-edition.md)。运行 make test-features 检查四组合：Go 参与文件、前端残留 chunk 清理/文本排除、features.json、真实 PC/375px 页面。当前编译开启也只是待对接占位，不存在真实检查/OTA API，不能把 capability 当作授权有效或更新已实现。archive manifest 必须反映实际 flags；CLI 始终不装配。Docker 的 --build-arg 两阶段保持一致，未运行镜像时明确记录。
