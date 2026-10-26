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
