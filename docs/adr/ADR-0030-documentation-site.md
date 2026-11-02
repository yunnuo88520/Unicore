<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0030：VitePress 文档站与单一 Markdown 来源

## 背景

框架已有使用指南、开发规范、运行手册和 Wiki 投影，但缺少带导航、搜索、正式域名的统一在线阅读入口。文档站需配套后续框架更新，并保持用户发行包、派生模板、Wiki 与维护资料的现有分发边界。

## 决定

使用 VitePress 1.6 稳定版，website 为独立 pnpm 工作区。现有 Markdown 继续作为来源，distribution/manifest.json 的 public-site audience 显式选择公开页面，site_assets 选择静态资源；构建只在 build 下生成投影及静态站。中英文首页/快速开始与主题入口配套，详细中文手册不声称全量英译。

VitePress 1.6 默认引入的 Vite 5 未通过当前依赖审计；通过 pnpm-workspace.yaml 的定向 override 使用 Vite 6.4.5，保留稳定版 VitePress，并验证静态构建、本地搜索与文档编辑更新。业务应用的 Vite 版本独立。后续升级 VitePress 时重新评估该 override，继续执行完整依赖审计。

正式地址配置为 https://unicore.ebox.vip，优先使用 GitHub Pages，也支持普通静态服务器。PR 与分支更新只校验构建，生产部署经 main 的手动 workflow 和 github-pages environment；源码配置不代表 DNS、TLS 或站点已经上线。

当前维护一份跟随 main 的开发文档，显示 VERSION 与预览状态，历史发行说明与文档指向对应 tag。未来确有多个不兼容稳定主版本需要并行支持时再引入版本目录，不为每个 0.x 补丁复制整套来源。

## 取舍

[VitePress](https://vitepress.dev/guide/what-is-vitepress) 直接使用 Markdown、提供本地搜索与多语言主题，适合现有 pnpm/Vite 开发环境；它的 Vue 主题运行时只用于静态文档，不进入共享 React UI 或任何应用 profile。

[Docusaurus](https://docusaurus.io/docs/versioning) 的 React/MDX 扩展和内建版本快照适合大量交互内容及多个版本并行维护，但本项目当前以现有 Markdown 为主，没有重用业务 React 组件或立即维护多份版本文档的需求。其版本复制机制现在会增加维护负担。

来源复用可以避免双写，但不会自动产生完整的使用说明。功能 PR 仍需人工维护行为、配置、示例、限制和升级说明；生成检查与静态构建负责发现结构漂移与链接错误。维护和部署见 [文档站手册](../03-runbooks/documentation-site.md)。
