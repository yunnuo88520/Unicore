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

应用用户首先联系应用维护者，反馈入口由自己的仓库和支持政策配置。确认通用框架问题后，开发者从 `project.provenance.json` 的 `upstream` 找到原框架仓库：

1. 查询已有 Issue，在干净框架或最小派生项目复现，注明框架来源提交、模板提交、Profile、系统、数据库及预期/实际行为。
2. Bug 使用上游 Bug 表单；通用需求说明适用场景、现有限制和验收标准。业务专属需求留在自己的应用中。
3. 通用修复在上游 Fork 的独立分支提交 PR，只包含框架修复和回归测试；不要把整个重命名后的业务仓库提交给框架。
4. 维护者合并并发布新的模板提交后，应用执行检查、隔离同步与验证。紧急本地补丁应独立提交并记录对应上游 Issue/PR，后续升级时一起审阅。

安全问题使用上游仓库的私密漏洞报告；应用自身漏洞找应用维护者。不要把真实凭据、备份或业务数据放进公开 Issue。社区没有固定响应时限，提交反馈不代表功能已排期。
