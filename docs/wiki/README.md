<!-- Author: yunnuo <ymz@ebox.vip> -->
# Wiki 生成与同步

主仓库 Markdown 是唯一维护来源，[pages.json](pages.json) 只维护 Wiki 页名与源码映射；[Home.md](Home.md) 为阅读导航。生成器重写相对链接：已映射页面指向 Wiki，其余源码/ADR/图片指向主仓库，保留页内锚点。侧栏与页脚自动生成。

```sh
make docs
make wiki                     # 只生成到 build/wiki，不联网、不发布
pnpm check:wiki               # 校验来源、链接和页名
```

维护者明确需要同步到 GitHub 时，在干净且已推送的 main 上执行：

```sh
make wiki-publish              # 重新生成、克隆 Wiki、提交并 push
```

首次 Wiki 必须由有写权限的维护者在 GitHub Wiki 页点击 Create the first page，保存标题为 Home 的页面；之后 Wiki 的 Git 仓库才存在。发布脚本遇到未初始化、非 main、脏工作区或未推送的 main 会拒绝，不自动改变登录、权限或主仓库分支。Git 使用本机现有凭据，不存新 token。

发布会完整替换已管理页面，但不删除未映射的人工页面。生成输出在 build/wiki，临时克隆在系统临时目录，成功或失败后只清理本脚本创建的克隆。若人工修改了已管理页面，先把修改迁回对应源码再同步；Wiki 页眉/页脚明确告知从源码生成。

默认目标是 github.com/yunnuo88520/Unicore；派生应用可通过 UNICORE_WIKI_REPOSITORY=owner/repo 指向自己的仓库。发布前必须将 provenance、README、反馈渠道与 Wiki 配置一起审阅。使用 GitHub 标准 main 分支；如果派生项目改默认分支，需同步调整发布脚本，不能静默改写目标。

生成与发布分离，不在普通文档生成/CI 中推送。GitHub Actions 的默认 GITHUB_TOKEN 通常不能直接写 Wiki，因此当前不增加持久写入 token 或无人值守同步。维护者在明确授权的本机执行发布；需要自动化时另行配置最小权限凭据与审批。
