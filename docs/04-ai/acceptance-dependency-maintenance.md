<!-- Author: yunnuo <ymz@ebox.vip> -->
# 依赖更新与分支清理

日期：2026-10-29。基于分片上传已合并的 main 评估七个 Dependabot PR，将六组可采用更新放在同一维护分支验证组合兼容性；原 PR 在替代 PR 合并后关闭并删除分支。应用 VERSION 不变，本轮不发布 Release，也不操作已有实例。

## 选择与影响

| 原 PR | 决定 | 依据与影响 |
| --- | --- | --- |
| #1 checkout v7 | 采用 | Node 24 Actions 运行时；现有 hosted runners 可用，不启用不安全 PR checkout |
| #2 pnpm/action-setup v6 | 采用 | 保留 pnpm 11.25.0 与既有缓存流程，不启用额外自动安装 |
| #3 attest-build-provenance v4 | 采用 | 保留 subject-path 与仅 bundle job 的 id-token/attestations 权限；不推送 registry |
| #4 jsdom 30.1.3 | 采用 | 测试环境更新；Node 22 至少 22.22.2，package engines、自检和开发说明同步 |
| #6 @types/node 26 | 不采用 | CI、Docker 与开发基线为 Node 22；保留 22 类型避免误用高版本 API，仅忽略该包的 major 版本更新 |
| #7 Vitest 5.0.5 | 采用 | 兼容 Vite 7、Node 22 类型与 jsdom，重新生成组合锁文件并验证真实测试 |
| #15 Go minor/patch 组 | 采用 | 更新 Wails 2.17.0、SQLite 1.61.0、MinIO 7.4.1、COS 0.7.76、OIDC/数据库驱动等十二项及间接依赖 |

Go 依赖影响 web-platform、web-standalone、desktop 和 cli 的各自依赖图；平台存储/身份仍仅平台装配。没有新 API、设置、权限或 schema，迁移级别不变；升级仍按备份/恢复规范执行。新版 SQLite 必须回归 Windows 盘符 URI 与原生重启，云 SDK 的升级不替代真实云环境验收：COS 仍待用户补权限，AWS 无测试环境。

Node 兼容范围以 package.json 为源，自检读取该范围；CI 与 Docker 继续使用最新 Node 22 补丁。其他被上游工具允许的 Node 系列列在 engines 中，不据此宣称已经逐一原生验收。Dependabot 对 Go、Actions 和其他 npm 更新继续开放，@types/node 的 patch/minor 更新仍开放；提高 Node 主版本时须一并重新评估类型和这条 ignore。

## 验证边界

合并必须通过当前提交的 quality、scan、docker-build 和 Linux/macOS/Windows 三个 native-desktop 门禁；这些 job 继续执行三数据库、页面、feature 组合、归档、真实 Docker/Compose/Tar 部署和 Windows exe 启动/重启。具体远端结果查看替代维护 PR 的 Checks，不能沿用原 Dependabot PR 在旧 main 上的绿灯。

手动候选工作流的 attestation 接口与权限已核对，正常 PR CI 不实际生成来源证明；本轮不触发候选签名、系统公证或发行。GitHub 仍报告 Echo 的两条 medium 告警（#17/#18），当前无修复版本，保留告警而不 dismiss。Wails 的开发服务依赖 Echo；框架的 Web 服务使用 Chi，当前不启用 Echo 的代理/限流中间件，后续仍需持续跟踪上游修复。

本地使用隔离的 Node 22.22.2 与 Go 1.26.10，已通过冻结锁文件安装、go mod verify、make docs、make test（Go race/vet、47 项 Vitest、类型/契约/双语/作者/边界/文档检查）、Web/CLI/ops 构建和 pnpm audit 全等级检查。自检接受 22.22.2，并拒绝旧的本机 22.21.1；没有修改系统 Node。外部 PostgreSQL/MySQL 与三系统原生、部署/页面矩阵以合并时相同 head 的远端 Checks 为准。
