<!-- Author: yunnuo <ymz@ebox.vip> -->
# 文档站维护与部署

文档站的正式域名配置为 `https://unicore.ebox.vip`，使用 VitePress 静态生成。仓库配置和本地构建不代表域名已经解析、GitHub Pages 已开启或站点已上线。选型与来源边界见 [ADR-0030](../adr/ADR-0030-documentation-site.md)。

## 本地开发与构建

仅需要满足根 package.json engines 的 Node 和 pnpm 11.25.0，不需要启动 Go 服务、数据库或 Wails。

```sh
pnpm install --frozen-lockfile
pnpm --dir website dev
# 校验公开文档输入和链接，然后生成静态站
pnpm --dir website check
pnpm --dir website build
pnpm --dir website preview
```

开发地址以 VitePress 输出为准，预览默认 `http://127.0.0.1:4174`。直接编辑 docs/product、规范或运行手册；开发服务监听白名单内的源 Markdown，自动重新投影。修改 VitePress 配置、VERSION 或站点资源后重启开发服务。输出为 build/docs-site（Markdown 投影）、build/docs-site-cache 与 build/docs-site-dist（可部署 HTML/JS/CSS）；都不提交。make docs 也生成 Markdown 投影，pnpm check:docs / make test 校验站点来源及生成器行为，实际静态构建由独立的 Documentation site workflow 执行。

## 内容来源与导航

distribution/manifest.json 是公开出口的唯一选择来源。documents 中 audience 包含 public-site 的页面进入站点；site_group 决定使用、开发、运维或参考侧栏，title 用于导航。站点专用中英文首页与英文快速开始在 website/pages，原有手册继续在 docs 维护同一份。site_assets 显式列出允许的品牌/图片资产，不扫描目录自动发布。

正文链接指向已选择的文档时改写为站内路由；指向源码、ADR 或尚未发布到站点的资料时保留为对应 GitHub 源码链接，CI 构建固定到该次提交。源码引用必须存在；未列入白名单的文件不会因此复制到站点。不要把秘密或实例配置放入任何源码文档。新增图片需登记 site_assets，新增正文链接优先使用仓库相对 Markdown 链接。

public-site 与 user-release、project-template、public-wiki 独立：新增站点页面不会扩大用户发行包、应用模板或 Wiki。上游 website 及 Pages workflow 不自动导出到派生应用；派生应用可自行建立文档站并配置自己的域名。

中英文首页、英文快速开始及主题导航同时维护；详细手册目前主要中文，英文入口明确标注中文目标。增加完整英文页面后再把对应入口切换到译文，不用中文正文冒充英文翻译。站点为独立的 VitePress 文档界面，不引入应用的 React WorkspaceLayout 或运行时身份依赖。

## 框架更新时维护什么

每个功能 PR 同时更新读者需要的内容，而不是发版时补写：

1. 用户可见的行为变更：更新 docs/product 对应指南，包含前提、命令、配置示例、支持的 profile、失败处理和已知限制。
2. 扩展方式变更：更新对应开发规范与业务样板；API/DTO 从 OpenAPI 生成，配置/权限/迁移说明与实际实现保持一致。
3. 不兼容、升级和数据变化：写清升级前备份、兼容范围与恢复路径，同步支持范围和中英文 CHANGELOG；重大决定记录 ADR。
4. 新主题：先写来源文档，再登记 public-site、标题与侧栏组；运行 make docs、make test 和 pnpm --dir website build。构建会拒绝断链，不以 ignoreDeadLinks 放行。

当前站点是随 main 更新的开发文档，不等同于最新已发行版本。导航显示 VERSION 和开发预览标记；已发行版本通过 GitHub tag 的原始文档与 Release 说明阅读。0.x 暂不为每个补丁复制一套文档。将来同时维护存在不兼容差异的多个稳定主版本时，再按主版本生成独立路径并提供版本切换。

## 部署到 unicore.ebox.vip

推荐 GitHub Pages：公开仓库可由 GitHub 托管静态产物，不需要额外购买公网服务器，也不需要手动把 HTML 上传到自己的服务器。GitHub Actions 负责构建和上传，Pages 负责对外提供文件，DNS 负责让域名找到 Pages。只增加 CNAME 不会自动创建或部署站点。

PR 和 main/dev 的文档变更只构建并上传 documentation-site artifact；正式发布使用手动 workflow。首次上线由具有仓库管理权限和域名 DNS 管理权限的人依次操作：

1. **先让配置进入 main。** 提交文档站、依赖锁文件及 `.github/workflows/docs.yml` 等配套变更，通过 PR 审阅后合并到 main。只有本地文件或 dev 分支有配置时，不能认为主分支已经可以部署。所有新提交使用英文标题和正文。
2. **建议验证域名所有权。** 打开 [账号 Settings → Pages](https://github.com/settings/pages)，选择 Add a domain，输入 `ebox.vip`。在该域名实际使用的 DNS 服务商添加 GitHub 给出的 TXT 名称和值，然后点击 Verify。以 GitHub 显示的内容为准，不自行编造验证值；验证后保留 TXT。所有权验证有助于保护域名绑定，并非普通 Pages 配置的必填前提。
3. **启用 Pages。** 打开 [仓库 Settings → Pages](https://github.com/yunnuo88520/Unicore/settings/pages)，在 Build and deployment → Source 选择 **GitHub Actions**。现有 workflow 已配置构建和发布，无需另选一个示例模板。在 Settings → Environments 中检查 `github-pages`，将允许部署的分支限制为 main；首次部署创建该 environment 后也应复核。团队如有审批规则，按规则完成审批。
4. **保存自定义域名。** 在仓库 Pages 的 Custom domain 输入 `unicore.ebox.vip` 并保存，不带 `https://` 或路径。优先在添加 DNS 前完成绑定；若首次部署前页面没有该选项，先按第 6 步运行一次 main 部署，再返回保存域名并继续 DNS 配置。本站按自定义域名根路径构建，最终以正式域名验证；默认的 `github.io/Unicore/` 路径不作为验收入口。
5. **添加 DNS 解析。** 在 `ebox.vip` 当前权威 DNS 服务商处添加下表记录，通常不是在 GitHub 中添加。只处理 `unicore` 同名的冲突记录，确认用途后再替换；保留根域名、邮箱及其他子域名的记录。Cloudflare 等提供代理的服务商首次配置时选择 **DNS only / 仅 DNS**。

   | 类型 | 主机记录 / Name | 目标 / Value | TTL |
   | --- | --- | --- | --- |
   | CNAME | `unicore` | `yunnuo88520.github.io` | 默认或 600 秒 |

   部分服务商要求完整主机名，此时输入 `unicore.ebox.vip`；普通相对名称输入框只填 `unicore`。目标不带 `https://`、仓库名 `/Unicore` 或其他路径。CNAME 与同名 A/AAAA 等记录不能并存。
6. **运行正式部署。** 打开 [Actions → Documentation site](https://github.com/yunnuo88520/Unicore/actions/workflows/docs.yml)，点击 Run workflow，分支选择 **main**，再点击运行。等待同一次运行的 `build` 和 `deploy` 都成功；如果 environment 要求审批，完成审批。选择 dev 或普通 push/PR 只会构建，`deploy` 显示 skipped 属于预期，不代表已发布。
7. **完成 HTTPS。** 回到仓库 Pages，确认 Custom domain 保存正确、DNS check successful；等待证书签发后勾选 **Enforce HTTPS**。DNS 传播及证书就绪可能需要最长 24 小时，不保证立即可用；证书由 GitHub 自动管理，无需在自己的服务器安装。DNS 检查失败时先修正解析，再等待证书。
8. **验证并设置仓库入口。** 用浏览器检查 `https://unicore.ebox.vip`、`/en/`、任意深层页面直接刷新、搜索、404、`/sitemap.xml`、`/robots.txt` 和移动端导航。成功后回到仓库首页右侧 About 齿轮，在 Website 填入 `https://unicore.ebox.vip` 并保存。中英文 README 顶部也提供该固定地址，开发者可以直接进入文档站。

生成器输出 CNAME、正式域名的 sitemap/robots 和 canonical URL。**通过自定义 Actions workflow 发布时，GitHub Pages 忽略产物中的 CNAME 文件，域名必须在仓库 Pages 的 Custom domain 中配置。** CNAME 文件既不能代替该设置，也不能代替 DNS 与 TLS 证书。没有操作域名或托管平台时，只交付配置和构建结果，不能宣称上线。

### 排查首次上线

| 现象 | 检查与处理 |
| --- | --- |
| Actions 没有 Documentation site 或 Run workflow | 确认 `.github/workflows/docs.yml` 已进入默认分支 main，且账号有运行 Actions 的权限。 |
| build 成功，deploy 被跳过 | 确认是在原仓库手动 Run workflow，且选择 main；dev、push、PR 和 fork 不触发发布。 |
| 域名无法解析或 DNS 检查失败 | 确认操作的是权威 DNS 服务商，主机名为 unicore，CNAME 目标无协议/路径，且没有同名冲突记录。可运行 `dig +short CNAME unicore.ebox.vip`，预期返回 `yunnuo88520.github.io.`。 |
| GitHub Pages 返回 404 | 确认 deploy 成功、Pages Source 为 GitHub Actions、自定义域名已保存且未绑定到其他仓库。 |
| HTTPS 选项暂不可选或证书未就绪 | 确认 DNS 和域名绑定正确后等待签发，不用关闭证书校验绕过；超过 24 小时仍异常时参考官方 HTTPS 排查说明。 |
| 仓库首页 Website 仍指向 Wiki | 修改仓库 About 的 Website；README 链接不会自动修改仓库元数据。 |

操作界面及规则以 GitHub 官方说明为准：[自定义域名](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)、[Actions 发布](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[所有权验证](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages)、[HTTPS 排查](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)。

### 后续更新与发布

框架更新时在同一 PR 维护对应文档，合入 main 后再手动运行同一 workflow 发布；仅合并代码不会更新线上站点。失败时保留上一个成功站点。若以后需要合并后自动部署，单独审阅发布策略并调整 workflow 的事件条件与 environment 保护。

### 自有 Nginx 静态托管

也可将 build/docs-site-dist 的内容上传到独立站点目录，DNS 指向该服务器并为 unicore.ebox.vip 配置 HTTPS。根目录与应用数据目录分开；不启动 Node 常驻服务，不使用 Docker socket 或应用内自替换二进制。Nginx 的 HTTPS server 内至少保留以下路由规则，证书路径由服务器实际配置提供：

```nginx
server_name unicore.ebox.vip;
root /srv/www/unicore-docs;
index index.html;
location / {
    try_files $uri $uri.html $uri/ =404;
}
error_page 404 /404.html;
```

不要把未知路径统一回退到首页；文档是预渲染多页面，深层地址应命中对应 HTML，缺失页面返回 404。更换内容时保留上一份完整静态构建，回退时切换站点目录；文档发布不运行数据库迁移。
