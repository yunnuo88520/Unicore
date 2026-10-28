<!-- Author: yunnuo <ymz@ebox.vip> -->
# GitHub 开源仓库维护

源码、社区文件与仓库设置分开管理。修改本手册或 workflow 不等于已开启 GitHub 功能，也不授权创建公开 Release、推送镜像或改变访问权限。当前应用能力与验证见 [PRD](../00-product/PRD.md) 和 [最新验收](../04-ai/acceptance-developer-kit.md)。

## 仓库内已有入口

| 文件 | 用途 |
| --- | --- |
| [README](../../README.md) / [文档入口](../README.md) | 形态选择、启动、派生、构建与能力边界 |
| [LICENSE](../../LICENSE) / [CHANGELOG](../../CHANGELOG.md) | MIT 条款与待发布变更 |
| [CONTRIBUTING](../../CONTRIBUTING.md) / [AGENTS](../../AGENTS.md) | 人与 AI 的开发边界、验证和贡献方式 |
| [SUPPORT](../../SUPPORT.md) / [SECURITY](../../SECURITY.md) / [行为准则](../../CODE_OF_CONDUCT.md) | 使用咨询、私密安全报告与社区规范 |
| [Issue 表单](../../.github/ISSUE_TEMPLATE) / [PR 模板](../../.github/PULL_REQUEST_TEMPLATE.md) | 最小复现、profile、验证和兼容影响 |
| [CI](../../.github/workflows/ci.yml) / [安全扫描](../../.github/workflows/security.yml) | 质量、数据库、页面、原生构建、部署与依赖检查 |
| [Dependabot](../../.github/dependabot.yml) | 每周检查 Go、pnpm 工作区和 Actions；每类最多 3 个版本更新 PR，minor/patch 分组，不自动合并 |
| [发布候选](../../.github/workflows/release.yml) | 手动构建候选包、checksum 与 GitHub 来源证明，不自动公开发行 |
| [Wiki 生成与同步](../wiki/README.md) | 19 篇主题文档及侧栏/页脚，从仓库 Markdown 生成，手动显式同步 |

Dependabot 的版本更新配置不等于 GitHub 已开启安全更新。pnpm 使用 npm ecosystem，后续更新后核对锁文件与实际 CI；工具链、Wails、Go 和原生依赖升级需要对应目标验证。

## GitHub 设置

2026-10-28 完成配置并核对以下项目。设置会变化，后续以仓库当前页面/API 为准。

| 项目 | 核对结果 | 建议与入口 |
| --- | --- | --- |
| 可见性与许可证 | Public，GitHub 已识别 MIT | 保留 LICENSE，派生项目也保留声明 |
| 仓库介绍 | 描述、Topics 与 Wiki Homepage | Topics：golang、react、typescript、wails、starter-kit、openapi、ai-development；Homepage 使用真实 Wiki，不配置空演示地址 |
| Issue / Discussions | Issue 开启，Discussions 关闭 | 目前使用 Issue 表单；咨询量增长后可在 Settings → General 开启 Discussions 并更新 SUPPORT |
| 私密漏洞报告 | 已开启 | 使用 Security 页的 Report a vulnerability，或 SECURITY.md 中的入口 |
| 密钥扫描/推送保护 | 两项开启 | 保持启用；收到告警先撤销并轮换真实密钥，不把删文件视为已经撤销凭据 |
| Dependabot 安全更新 | 告警及安全更新已开启 | 已有每周版本检查；安全 PR 仍需检查锁文件、变更影响与 CI，不自动合并 |
| main 保护 | Unicore main quality gate 规则 | 要求 PR、quality/docker-build/scan 与三系统原生检查，禁止强推和删除；不要求另一个维护者批准 |
| 合并与分支清理 | 允许 Squash，自动删除已合并分支开启 | 主分支受保护；功能分支合并后自动清理 |
| Wiki | 已初始化，支持源码同步 | 页面清单见 docs/wiki/pages.json；执行 make wiki-publish 前检查 main 已干净推送 |
| Releases / tags | 首次开发预览按下节验收后发布 | 实际可下载资产以 GitHub Releases 为准，不把 VERSION 或 workflow 配置当作已经发布 |

不要仅为了资料完整而创建空文档站、不可访问的演示、FUNDING 或未经同意的 CODEOWNERS。当前维护者较少，先使用源码文档和明确的反馈入口即可。Template repository 为可选项；派生应用优先使用创建器完成 module/品牌定制。

### main 规则建议

PR 合并前要求检查通过，并限制强制推送和删除。当前必需 job 名称为 quality、docker-build、scan，以及 native-desktop (ubuntu-22.04)、native-desktop (macos-14)、native-desktop (windows-latest)，绑定 GitHub Actions app（15368）。规则要求分支基于最新 main、对话解决、线性历史；无 bypass actor，管理员也走 PR。正常用 Squash 合并，不能再直接 push main。

单维护者阶段审批数为 0，不设置自己无法满足的“必须由他人批准”；代码仍需全部检查。多人协作后可要求 1 名其他维护者批准。仓库管理员保留编辑规则的能力用于修复规则错误，但不设置持续绕过权限。规则属于 GitHub 设置，不随源码自动生效。

Actions 保持最小权限，fork PR 不提供发布密钥，不使用 pull_request_target 执行贡献者代码。当前候选 workflow 的 id-token/attestations 写权限仅限候选 job；正式发布另使用受保护 environment 和受限 registry/GitHub 凭据。

## 首次可下载版本

1. 确定发布点：整理 Unreleased、兼容说明与未实现范围，版本仍只从 VERSION 生成。当前可先发布标记为 prerelease 的开发预览，不宣称稳定版。
2. 在可信提交运行质量/安全/原生构建与部署检查，再手动运行 Prepare release candidate；核对下载的归档、manifest、checksum 与构建来源。失败不使用旧 artifact 冒充新提交。
3. 另获发布授权后，创建匹配 VERSION 的 tag 和 GitHub Release，附各 profile 的 tar、checksums、manifest、系统/架构和安装/备份/升级说明。未签名与窗口未实测范围要写清；不附数据目录、实例配置、密钥或安装凭据。
4. 原生桌面公开分发前考虑平台签名/公证；需要镜像时对接 GHCR 等受控 registry、版本标签和 digest，先验收公开拉取再提供运行命令。当前只配置候选 artifact，不存在可承诺的公开镜像地址。
5. 建立后续小版本记录、迁移/恢复证据和已知问题。开源初期可逐步补英文 README、独立文档站、示例视频与 SBOM；这些不应阻塞已验证源码的使用。

构建和发布操作见 [发版手册](release.md)，派生项目需替换仓库链接、Issue 联系方式、维护者和上游反馈入口，见 [框架更新约定](framework-upgrade.md)。
