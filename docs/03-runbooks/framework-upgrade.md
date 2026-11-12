<!-- Author: yunnuo <ymz@ebox.vip> -->
# 派生项目与上游更新

源码采用 MIT；派生项目可以商用、修改和再分发，保留 LICENSE 的版权与许可声明。框架原有作者头保留，新业务的作者归属可按团队规范扩展，先同步 check-authors 规则；不要全仓替换历史作者。产品名称、CLI 命令与部署标识的唯一入口是派生项目自己的 `product.identity.json`（见[产品身份规范](../02-standards/product-identity.md)）；主题色板入口 assets/theme/tokens.json，图标轮廓与原生标识入口 assets/brand/identity.json。

从当前已提交的框架创建新应用：

```sh
pnpm create:project --directory ../my-app --name 'My App' --slug my-app --module github.com/team/my-app --bundle com.team.myapp --repository https://github.com/team/my-app
cd ../my-app
make install
make docs
make doctor
make test
make build-web build-cli build-ops
```

创建器已完成 git init、基于 framework-template 模板提交的初始基线提交（真正的共同祖先），并添加只读 `framework` 远端指向上游；未提供 --repository 时，推送前先 `git remote add origin <你的仓库>`。源码归档导出（无 Git 来源）或模板分支缺失时退回独立根提交，provenance 的 `template_revision` 为空，此时上游三方合并不可用，须重建项目或手工嫁接模板历史。创建器只导出 distribution/manifest.json 的显式模板文件，不因文件被 Git 跟踪而自动复制。默认拒绝选中输入与 HEAD 不同或未跟踪的来源，先使用已审阅的干净源码；仅在明确需要导出已审阅工作区时使用 --allow-dirty，白名单和安全检查仍生效。provenance 记录上游提交、上游模板版本、生成器版本、身份摘要、dirty 状态及输入摘要；无 Git 的源码归档记录 unversioned，不伪造提交。导出不携带上游研究资料、运行数据、环境文件、.git 或主仓库历史。创建器按命令行参数生成派生项目自己的 product.identity.json 与 identity.gen.go，并同步各混合文件的身份字段；Go module 的文本引用一起替换。pnpm 内部 @unicore 包名保留以降低上游合并冲突；发行归档/默认镜像名使用产品 slug。桌面默认数据目录由应用名称生成；产品更名后已有数据需显式 APP_DATA_DIR。`product.identity.json` 属 product-owned：上游合并不覆盖它，合并后执行 make docs 重新生成身份投影，再运行 make test 验证对账。

可选 `--repository https://github.com/OWNER/REPO` 配置自己的 origin（也接受以 .git 结尾的 HTTPS GitHub 地址），同时更新界面文档入口、.github/ISSUE_TEMPLATE/config.yml 及 SUPPORT/SECURITY/CONTRIBUTING/CODE_OF_CONDUCT 中的仓库链接；未提供时仍需自行添加 origin。创建器只配置本地仓库，不创建 GitHub 仓库或推送。main 为初始开发分支；framework 远端的 push URL 禁用，仍可 fetch 上游模板。project.provenance.json 的上游 URL、MIT 版权和原作者头保持不变。支持邮箱、维护者策略、工作流和 UNICORE_WIKI_REPOSITORY 仍须按应用实际情况审阅，勿把框架 CI 徽章当作派生应用验证。导出后运行 pnpm check:residuals 确认产品可见面无框架身份残留；面向用户文案与模板文档的改动不得重新引入框架名。

框架可共享部分主要在 packages/*、internal/platform/settings/files/install/adapter 与 scripts；样板业务在 internal/modules/notes 及其前端模块。当前没有能隔离全部改动的插件 ABI，团队应尽量让自己的业务进入独立目录，少修改框架基座。

应用侧完整操作以会随模板分发的[创建、源码同步、冲突处理与上游反馈](../product/framework-upgrade.md)为准。源码 ZIP 没有共同祖先，不承诺自动合并；这与应用二进制 OTA 是两条独立路径。

## 维护者发布模板

`main` 的完整质量与构建工作流通过后，模板发布工作流从同一提交生成、推送线性延续的 `framework-template`。它核对该提交仍为当前 main；过期的 CI 不发布旧模板。质量检查包含 `pnpm verify:derived`：从真实分发清单创建改名应用并执行其 make docs、make test 与 Web/CLI/运维构建。模板分支不包含维护者治理资料，也不携带 main 历史。失败时检查真实导出和派生回归，不能强推新孤儿历史。

手工补发仅在已审阅的干净提交中执行：

```sh
git fetch origin main framework-template
git switch main
git merge --ff-only origin/main
pnpm framework:template
# 审阅生成树与真实派生项目检查后：
git push origin framework-template
```

生成器会获取已发布模板并从现有本地或远端模板提交延续历史；本地与已发布历史分叉时拒绝生成。不能用 force push 绕过分叉，否则已有应用将失去可用的共同祖先。模板提交即使版本号相同，也应通过提交和差异识别更新。

回退不是把旧 binary 覆盖到新数据库。使用升级前的加密快照恢复到新目录/空数据库，部署匹配的旧二进制、配置与静态资源，验证后再切流。旧实例及备份保留到恢复窗口结束。参考 [备份手册](backup.md) 和 [发版手册](release.md)。
