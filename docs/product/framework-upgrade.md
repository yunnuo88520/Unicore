<!-- Author: yunnuo <ymz@ebox.vip> -->
# 创建自己的应用、同步框架与贡献修复

这里的升级是把框架源码修复合并到自己的业务仓库。已部署应用的二进制 OTA 属于[应用更新](updates.md)：发布者使用自己的仓库、应用 ID 和签名公钥。创建器会清空上游 OTA 信任配置，避免业务应用安装框架自身的发行包。

## 创建可持续升级的项目

从正常的 Git clone 创建项目，保留 `origin/framework-template`；不要使用 `--single-branch` 或源码 ZIP 代替完整模板历史。已有单分支 clone 先执行：

```sh
git fetch origin refs/heads/framework-template:refs/remotes/origin/framework-template
```

然后在干净、已审阅的框架源码中创建自己的应用：

```sh
pnpm create:project --directory ../my-app --name 'My App' --slug my-app --module github.com/team/my-app --bundle com.team.myapp --repository https://github.com/team/my-app
cd ../my-app
make install
make docs
make doctor
make test
make build-web build-cli build-ops
```

创建器完成本地初始提交并配置自己的 `origin`，不会创建托管仓库或推送。只读 `framework` 远端用于获取上游模板，其 push URL 禁用。`project.provenance.json` 记录来源提交、初始模板提交和输入摘要；`template_revision` 非空才有可验证的共同祖先。源码 ZIP 可以导出项目，但没有模板历史，README 会标明不可自动同步；不要用 `--allow-unrelated-histories` 强行拼接历史。需要持续升级时，应重新从带模板历史的 Git clone 创建，随后迁入自己的业务提交。

名称、Go module、命令、桌面标识、服务目录和发行名由 `product.identity.json` 管理，修改后执行 `pnpm product:generate`、`pnpm product:check` 和 `pnpm check:residuals`。图形与主题仍分别由品牌、主题设计源配置；已有安装的数据目录不应随意更名，必要时显式设置 `APP_DATA_DIR`。内部包名和框架 SQL 的稳定命名空间保留，不做全仓字符串替换。

业务进入 `internal/modules/<slug>` 等自己的目录，尽量减少对框架公共文件的修改。API、页面、权限、迁移和跨 Profile 约束见[应用开发](development.md)。当前源码集成使用 Git 三方合并，没有可以隔离所有定制改动的稳定插件 ABI。

## 检查与同步

先提交自己的业务改动和身份配置，在单独的升级分支操作：

```sh
git switch -c upgrade/framework
pnpm framework:check
pnpm framework:sync
```

`check` 获取上游模板并显示版本、提交、文件及冲突预览；预览是 Git 对当前树的估计，最终以隔离合并结果为准。模板更新可发生在同一版本号内，应查看提交和文件差异。

`sync` 先创建 `backup/pre-sync-*` 备份分支，在隔离的 Git worktree 中归一化名称与 Go module、三方合并，再恢复应用自己的身份与来源记录。身份和残留校验通过，且原分支/工作区没有并发变化时，才以 fast-forward 推进应用分支。普通准备、合并命令或校验异常不推进原分支，也不留下半套产品名称。工具不自动执行上游脚本、生产迁移、测试或推送。

成功后仍须执行：

```sh
make docs
make test
make build-web build-cli build-ops
# 有页面改动时执行真实后端浏览器测试；原生变化在对应系统验证。
```

检查真实数据库与迁移兼容后，再审阅和推送。同步报告在 `build/sync-report-*.md`。备份分支只保存源码，不能撤销已经运行的数据库迁移；运行部署前按[备份与恢复](backup.md)准备独立恢复副本。

## 解决冲突、继续或中止

真实内容冲突时，原分支保持不变，工具打印隔离 worktree 的绝对路径和文件清单。保留业务意图，人工合并两边内容；不要直接删除所有冲突文件或对整个树选择一侧。示例中的路径替换为工具打印的实际值：

```sh
git -C /path/printed/by/sync status
# 在该 worktree 内编辑冲突文件，确认内容后逐个暂存。
git -C /path/printed/by/sync add path/to/resolved-file
# 回到自己的应用仓库：
pnpm framework:sync --continue
```

继续操作会重新检查未解决冲突、产品身份和残留；失败时仍不推进原分支，隔离现场保留以便修正。不要在隔离树中运行应用或连接生产数据库。同步期间若原分支、HEAD 或工作区改变，继续操作会拒绝；可以保留自己的新工作并中止本次同步：

```sh
pnpm framework:sync --abort
```

`--abort` 仅丢弃本次隔离合并及其人工解决结果，不重置业务分支、不删除业务工作区的新改动。完成或中止前不要再次发起新的同步。

## 应用反馈与框架通用问题

应用用户首先联系应用维护者，应用的反馈入口由自己的仓库和支持政策配置。疑似通用框架问题按以下流程处理；AI 使用项目自带的 framework-upstream Skill，由 AGENTS、开发地图和应用开发 Skill 引导。框架上游地址从 project.provenance.json 的 upstream 读取，不能直接把应用自己的 Issues 当作框架反馈入口。

### 先判断归属并复现

| 判断 | 处理方式 |
| --- | --- |
| 配置、依赖或部署问题 | 修正应用配置或使用方式；文档有误时再反馈上游 |
| 仅业务定制触发 | 在应用内修复；提取通用缺陷需另做最小复现 |
| 干净框架或最小派生项目同样复现 | 作为框架通用缺陷准备 Issue/PR 和回归测试 |
| 尚未隔离根因 | 标明待确认，保留证据，不能只因文件位于框架目录就归责上游 |

先检查工作区，保护已有改动。在独立测试目录/实例复现，不连接生产数据。记录应用提交与框架来源：project.provenance.json 的 revision、template_revision 是创建时的来源；多轮同步后的当前框架基线用实际 framework-template 共同祖先确认。应用 VERSION 可能有独立发版节奏，不能单靠它判断框架是否已修复。

在派生项目执行以下只读检查（check 会获取上游模板）。紧接 check 使用 FETCH_HEAD，期间不要执行其他 fetch；命令失败时记录失败原因，不伪造模板提交：

```sh
git rev-parse HEAD
pnpm framework:check
git merge-base HEAD FETCH_HEAD
```

查询已有上游 Issue/PR；如果修复已发布到模板，先审阅修复与本地差异，按任务范围选择同步。纯排查任务不顺带合入其他框架更新。

### 本地修复与反馈准备

需要恢复业务开发时，可以先完成已授权的本地修复。通用补丁和业务功能分开，涉及提交时独立提交并附回归测试；记录对应上游 Issue/PR，尚未提交就记录本地草稿位置，不编造编号。无需等待社区回复才完成本地工作。

复现目录、补丁、反馈草稿和临时补丁跟踪放 build/ 或仓库外，不加入源码 docs。每个临时补丁记录触发条件、本地提交、关联上游问题及移除条件；后续同步时核对，不能看到上游声称修复就直接删除本地逻辑。

可将以下内容填入本地反馈草稿；字段不适用时说明原因：

```markdown
标题：具体触发条件及错误行为
问题归属：配置 / 业务定制 / 框架通用 / 待确认，附判断依据
框架来源：upstream、初始 revision/template_revision、当前已合入模板提交
应用状态：本地提交、相关定制与临时补丁（不提供私有仓库或业务代码全文）
环境：Profile、OS/架构、数据库/版本、部署方式及相关依赖
最小复现：从干净框架或最小派生项目开始的步骤和合成数据
预期 / 实际：行为、错误、复现频率
根因与最小补丁：已确认的调用链、改动范围；未确认处单独标记
回归验证：修复前如何失败、修复后实际执行的命令与结果、未测项
兼容影响：API、权限、配置、数据库迁移及恢复边界
上游状态：草稿 / 已提交 Issue或PR / 已合并 / 已发布模板，附实际链接或提交
```

公开 Issue/PR、推送补丁或通知维护者沿用用户明确授权。没有外发授权时，AI 交付本地草稿与可审查补丁，并完成仍可执行的本地验证；不能报告“已反馈上游”。不要上传完整重命名仓库、凭据、备份、私有地址或业务数据。疑似安全漏洞改走上游仓库的私密报告；应用自身漏洞找应用维护者。

### 上游修复与下游收敛

通用修复在干净的上游 Fork/独立分支提交 PR，只包含框架补丁、回归测试及必要文档。将本地修复转到框架时，核对名称、Go module、数据库命名空间和权限边界，去掉业务定制。AI 生成的复现与代码仍由贡献者审核。

维护者合并到 main、通过质量检查，并由模板工作流发布 framework-template 后，下游才能获取新模板。修复只在 dev、main 或 PR 中出现，不等于已向派生项目发布；社区没有固定响应时限，反馈不表示已排期。

应用维护者执行本页的检查、隔离同步、冲突处理和验证流程。核对临时补丁是否被正式修复覆盖：已覆盖的补丁通过明确的后续改动收敛，仍需要的业务差异保留，不批量回退整个文件或强制选择上游一侧。合并成功后运行自己的测试和受影响构建；源码同步不执行生产迁移，也不代替应用发版。

交付时分别说明本地是否修复、反馈是否实际提交、上游是否合并、模板是否发布、应用是否同步及验证；没有观察到的阶段保持待确认。

### 给应用 AI 的任务示例

```text
按 AGENTS.md 和 framework-upstream Skill 排查这个问题：先保护已有改动，
确认配置、业务或框架归属，在隔离环境做最小复现。需要时完成本地最小修复
和回归测试，将通用补丁与业务修改分开；按框架升级指南整理反馈草稿。
已有上游修复时先核对模板是否发布，再按本次任务范围同步并验证。
报告各阶段真实状态；外发、推送和部署沿用本次明确授权。
```
