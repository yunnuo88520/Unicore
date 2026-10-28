<!-- Author: yunnuo <ymz@ebox.vip> -->
# 派生项目与上游更新

源码采用 MIT；派生项目可以商用、修改和再分发，保留 LICENSE 的版权与许可声明。框架原有作者头保留，新业务的作者归属可按团队规范扩展，先同步 check-authors 规则；不要全仓替换历史作者。名称/主题入口 assets/theme/tokens.json，图标轮廓与原生标识入口 assets/brand/identity.json。

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

生成后再提交初始基线。创建器导出被 Git 跟踪的文件当前内容；请先提交或暂存完整框架改动，避免遗漏未跟踪文件。导出不携带运行数据、环境文件或 .git。Go module 的文本引用一起替换；pnpm 内部 @unicore 包名和 unicore/unicore-ops 工具名保留以降低上游合并冲突，发行归档/默认镜像名使用产品 slug。桌面默认数据目录由应用名称生成；产品更名后已有数据需显式 APP_DATA_DIR。

project.provenance.json 保存上游 URL 和起点 commit。框架可共享部分主要在 packages/*、internal/platform/settings/files/install/adapter 与 scripts；样板业务在 domain/usecase/notes、notessql 与 notes-page。当前没有能隔离全部改动的插件 ABI，团队应尽量让自己的业务进入独立目录，少修改框架基座。

升级采用常规三方合并，不提供“覆盖式更新”脚本：

1. 在干净分支备份当前代码、DB/data/密钥/云文件，记录运行版本和迁移等级。
2. 添加 framework 只读远端并 fetch，比较 provenance 的起点与目标 tag/commit、CHANGELOG 和 ADR。
3. 用 merge 或挑选所需提交；处理 module、主题、实例装配和 UI 冲突。首次基线导出无共同历史时，先以 provenance 起点建立三方 diff 或手工应用补丁，不使用强制覆盖。
4. 保留所有已执行迁移 checksum，增加业务新迁移，执行 make docs/test、相关构建、三方言/页面与恢复验收。
5. 在独立恢复副本验证目标版本启动、账号/文件/业务数据，再部署。记录新 provenance 与本地偏差。

回退不是把旧 binary 覆盖到新数据库。使用升级前的加密快照恢复到新目录/空数据库，部署匹配的旧二进制、配置与静态资源，验证后再切流。旧实例及备份保留到恢复窗口结束。参考 [备份手册](backup.md) 和 [发版手册](release.md)。
