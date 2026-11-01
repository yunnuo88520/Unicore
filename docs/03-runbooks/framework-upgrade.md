<!-- Author: yunnuo <ymz@ebox.vip> -->
# 派生项目与上游更新

源码采用 MIT；派生项目可以商用、修改和再分发，保留 LICENSE 的版权与许可声明。框架原有作者头保留，新业务的作者归属可按团队规范扩展，先同步 check-authors 规则；不要全仓替换历史作者。产品名称、CLI 命令与部署标识的唯一入口是派生项目自己的 `product.identity.json`（见[产品身份规范](../02-standards/product-identity.md)）；主题色板入口 assets/theme/tokens.json，图标轮廓与原生标识入口 assets/brand/identity.json。

从当前已提交的框架创建新应用：

```sh
pnpm create:project --directory ../my-app --name 'My App' --slug my-app --module github.com/team/my-app --bundle com.team.myapp
cd ../my-app
make install
make docs
make doctor
make test
make build-web build-cli build-ops
```

创建器已完成 git init、基于 framework-template 模板提交的初始基线提交（真正的共同祖先），并添加只读 `framework` 远端指向上游；推送前先 `git remote add origin <你的仓库>`。源码归档导出（无 Git 来源）或模板分支缺失时退回独立根提交，provenance 的 `template_revision` 为空，此时上游三方合并不可用，须重建项目或手工嫁接模板历史。创建器只导出 distribution/manifest.json 的显式模板文件，不因文件被 Git 跟踪而自动复制。默认拒绝选中输入与 HEAD 不同或未跟踪的来源，先使用已审阅的干净源码；仅在明确需要导出已审阅工作区时使用 --allow-dirty，白名单和安全检查仍生效。provenance 记录上游提交、上游模板版本、生成器版本、身份摘要、dirty 状态及输入摘要；无 Git 的源码归档记录 unversioned，不伪造提交。导出不携带上游研究资料、运行数据、环境文件、.git 或主仓库历史。创建器按命令行参数生成派生项目自己的 product.identity.json 与 identity.gen.go，并同步各混合文件的身份字段；Go module 的文本引用一起替换。pnpm 内部 @unicore 包名保留以降低上游合并冲突；发行归档/默认镜像名使用产品 slug。桌面默认数据目录由应用名称生成；产品更名后已有数据需显式 APP_DATA_DIR。`product.identity.json` 属 product-owned：上游合并不覆盖它，合并后执行 make docs 重新生成身份投影，再运行 make test 验证对账。

project.provenance.json 保存上游 URL 和起点 commit。创建器不改写所有社区文件中的仓库链接、作者邮箱或维护者策略；建立自己的仓库后，检查 .github/ISSUE_TEMPLATE/config.yml、SUPPORT/SECURITY/CONTRIBUTING/CODE_OF_CONDUCT、工作流、文档里的反馈地址和 UNICORE_WIKI_REPOSITORY，按应用实际情况改为自己的渠道，避免把应用业务问题导向框架维护者。保留框架 MIT 版权和来源，勿把框架 CI 徽章当作派生应用验证。导出后运行 pnpm check:residuals 确认产品可见面无框架身份残留；面向用户文案与模板文档的改动不得重新引入框架名。

框架可共享部分主要在 packages/*、internal/platform/settings/files/install/adapter 与 scripts；样板业务在 domain/usecase/notes、notessql 与 notes-page。当前没有能隔离全部改动的插件 ABI，团队应尽量让自己的业务进入独立目录，少修改框架基座。

升级采用 framework-template 模板分支的三方合并，同步工具不提供“覆盖式更新”：

1. 确认工作区干净。创建器已写入只读 framework 远端，`provenance.template_revision` 即导出时的模板提交（共同祖先）；维护者在框架侧用 `pnpm framework:template` 生成并推送该分支（孤儿根提交，仅含分发白名单与框架身份文件，不携带主仓库历史）。
2. `pnpm framework:check`：比对本地与上游模板版本、待合并提交与文件清单、冲突预览；工作区不干净先提交或暂存。
3. `pnpm framework:sync`：自动创建 `backup/pre-sync-*` 备份分支，先把产品身份归一化为框架命名，再与 framework-template 三方合并，然后重新应用产品身份、部署重命名与模块路径，重跑 `product:check` 与残留扫描，报告写入 `build/sync-report-*.md`。
4. 真实冲突时同步中止且工作区零改动，按报告手工解决后重跑；工具不静默覆盖产品修改，不自动执行生产数据库迁移。
5. 同步后执行 make docs、make test 与受影响构建，在独立恢复副本验证后推送；回滚用 `git reset --hard backup/pre-sync-*`。

模块路径说明：同步前自动把框架管理文件中的产品 module 归一化为模板 module，合并后再恢复为产品 module；product-owned 业务代码不参与转换。完整示例：首次创建（创建器完成基线提交）→ 提交业务代码与身份调整 → 框架发布新版本并更新 framework-template → `pnpm framework:check` → `pnpm framework:sync` → make docs/test → 第二次同步重复同样步骤；所有权分类见 [distribution/manifest.json](../../distribution/manifest.json) 的 ownership 与 [产品身份规范](../02-standards/product-identity.md)。

回退不是把旧 binary 覆盖到新数据库。使用升级前的加密快照恢复到新目录/空数据库，部署匹配的旧二进制、配置与静态资源，验证后再切流。旧实例及备份保留到恢复窗口结束。参考 [备份手册](backup.md) 和 [发版手册](release.md)。
