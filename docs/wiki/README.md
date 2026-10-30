<!-- Author: yunnuo <ymz@ebox.vip> -->
# Wiki 生成与同步

公开用户 Wiki 的唯一页面清单是 distribution/manifest.json 中带 public-wiki audience 的 documents，与用户发行文档和项目模板共用来源。当前只使用 docs/product 的八篇指南。旧主题清单与旧首页已退役，不再维护另一份页面定义。

生成前校验正文链接闭包：本地链接只能指向白名单页面；拒绝 ADR/研发证据和仓库 blob/tree 跨链，包括裸 URL、编码路径及不支持的 HTML/reference 链接。不能只隐藏侧栏。侧栏与页脚由当前公开清单生成。

```sh
make docs
make wiki                     # 只生成到 build/public-wiki，不联网、不发布
pnpm check:wiki               # 校验来源、链接和页名
```

维护者明确需要同步到 GitHub 时，在干净且已推送的 main 上执行：

```sh
make wiki-publish              # 重新生成、克隆 Wiki、提交并 push
```

首次 Wiki 必须由有写权限的维护者在 GitHub Wiki 页点击 Create the first page，保存标题为 Home 的页面；之后 Wiki 的 Git 仓库才存在。发布脚本遇到未初始化、非 main、脏工作区或未推送的 main 会拒绝，不自动改变登录、权限或主仓库分支。Git 使用本机现有凭据，不存新 token。

发布会完整替换当前白名单页面，但不删除已有人工页面或历史远端页面。历史 Wiki 清理需要独立审阅和发布授权，本阶段不触碰远端。生成目录若包含白名单外文件会失败，要求换新目录，不自动删除或继续携带旧页面。生成输出在 build/public-wiki，临时克隆在系统临时目录，成功或失败后只清理本脚本创建的克隆。若人工修改了已管理页面，先把修改迁回对应源码再同步；Wiki 页眉/页脚明确告知从源码生成。

默认目标是 github.com/yunnuo88520/Unicore；派生应用可通过 UNICORE_WIKI_REPOSITORY=owner/repo 指向自己的仓库。发布前必须将 provenance、README、反馈渠道与 Wiki 配置一起审阅。使用 GitHub 标准 main 分支；如果派生项目改默认分支，需同步调整发布脚本，不能静默改写目标。

生成与发布分离，不在普通文档生成/CI 中推送。GitHub Actions 的默认 GITHUB_TOKEN 通常不能直接写 Wiki，因此当前不增加持久写入 token 或无人值守同步。维护者在明确授权的本机执行发布；需要自动化时另行配置最小权限凭据与审批。
