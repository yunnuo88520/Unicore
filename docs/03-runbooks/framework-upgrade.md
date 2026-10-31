<!-- Author: yunnuo <ymz@ebox.vip> -->
# 派生项目与上游更新

源码采用 MIT；派生项目可以商用、修改和再分发，保留 LICENSE 的版权与许可声明。框架原有作者头保留，新业务的作者归属可按团队规范扩展，先同步 check-authors 规则；不要全仓替换历史作者。产品名称、CLI 命令与部署标识的唯一入口是派生项目自己的 `product.identity.json`（见[产品身份规范](../02-standards/product-identity.md)）；主题色板入口 assets/theme/tokens.json，图标轮廓与原生标识入口 assets/brand/identity.json。

从当前已提交的框架创建新应用：

```sh
pnpm create:project --directory ../my-app --name 'My App' --slug my-app --module github.com/team/my-app --bundle com.team.myapp
cd ../my-app
git init
make install
make docs
make doctor
make test
make build-web build-cli build-ops
```

生成后再提交应用初始基线。创建器只导出 distribution/manifest.json 的显式模板文件，不因文件被 Git 跟踪而自动复制。默认拒绝选中输入与 HEAD 不同或未跟踪的来源，先使用已审阅的干净源码；仅在明确需要导出已审阅工作区时使用 --allow-dirty，白名单和安全检查仍生效。provenance 记录上游提交、dirty 状态及输入摘要；无 Git 的源码归档记录 unversioned，不伪造提交。导出不携带上游研究资料、运行数据、环境文件或 .git。创建器按命令行参数生成派生项目自己的 product.identity.json 与 identity.gen.go，并同步各混合文件的身份字段；Go module 的文本引用一起替换。pnpm 内部 @unicore 包名保留以降低上游合并冲突；发行归档/默认镜像名使用产品 slug。桌面默认数据目录由应用名称生成；产品更名后已有数据需显式 APP_DATA_DIR。`product.identity.json` 属 product-owned：上游合并不覆盖它，合并后执行 make docs 重新生成身份投影，再运行 make test 验证对账。

project.provenance.json 保存上游 URL 和起点 commit。创建器不改写所有社区文件中的仓库链接、作者邮箱或维护者策略；建立自己的仓库后，检查 .github/ISSUE_TEMPLATE/config.yml、SUPPORT/SECURITY/CONTRIBUTING/CODE_OF_CONDUCT、工作流和文档里的反馈地址，按应用实际情况改为自己的渠道，避免把应用业务问题导向框架维护者。保留框架 MIT 版权和来源，勿把框架 CI 徽章当作派生应用验证。

框架可共享部分主要在 packages/*、internal/platform/settings/files/install/adapter 与 scripts；样板业务在 domain/usecase/notes、notessql 与 notes-page。当前没有能隔离全部改动的插件 ABI，团队应尽量让自己的业务进入独立目录，少修改框架基座。

升级采用常规三方合并，不提供“覆盖式更新”脚本：

1. 在干净分支备份当前代码、DB/data/密钥/云文件，记录运行版本和迁移等级。
2. 添加 framework 只读远端并 fetch，比较 provenance 的起点与目标 tag/commit、CHANGELOG 和 ADR。
3. 用 merge 或挑选所需提交；处理 module、主题、实例装配和 UI 冲突。首次基线导出无共同历史时，先以 provenance 起点建立三方 diff 或手工应用补丁，不使用强制覆盖。
4. 保留所有已执行迁移 checksum，增加业务新迁移，执行 make docs/test、相关构建、三方言/页面与恢复验收。
5. 在独立恢复副本验证目标版本启动、账号/文件/业务数据，再部署。记录新 provenance 与本地偏差。

回退不是把旧 binary 覆盖到新数据库。使用升级前的加密快照恢复到新目录/空数据库，部署匹配的旧二进制、配置与静态资源，验证后再切流。旧实例及备份保留到恢复窗口结束。参考 [备份手册](backup.md) 和 [发版手册](release.md)。
