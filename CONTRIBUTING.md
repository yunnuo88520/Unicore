<!-- Author: yunnuo <ymz@ebox.vip> -->
# 参与 Unicore

欢迎提交可复现的问题、文档修正和有明确场景的功能。当前为开发预览，范围见 [PRD](docs/00-product/PRD.md)。使用问题先看 [SUPPORT.md](SUPPORT.md)，漏洞通过 [SECURITY.md](SECURITY.md) 的私密渠道反馈。

## 开始改动

1. 阅读 [AGENTS.md](AGENTS.md)、[架构](docs/01-architecture/architecture.md) 和相关 ADR；AI 开发再读 [工作流](docs/04-ai/development.md) 与仓库内对应 Skill。
2. Fork 仓库并创建功能分支。较大改动先用功能建议 Issue 说明场景、profile 和验收结果；小型修复可直接提交 PR。
3. 按 [README](README.md) 安装依赖并运行 `make doctor`。使用独立数据目录、测试数据库和模拟服务；不要复用生产数据、真实邮件收件人或云文件。
4. 一个 PR 解决一个明确问题，写清触发条件、修改后的行为及兼容影响。AI 生成的改动同样需要贡献者阅读、验证和解释。

## 框架边界

共享依赖向内：entry → adapter → usecase → domain。平台身份、邮件、云存储和管理端不进入单机、桌面或 CLI；不要为了共享代码而装配不适用模块。CLI 不引入 SQL、HTTP 或 Wails。

API/DTO 从 `packages/contracts/openapi.json` 修改并执行 `pnpm generate`；页面通过 AppClient 调用，后端独立校验权限。设置登记 SettingDefinition，数据库变更新增分方言迁移，不改历史 checksum。文件业务引用 file_id；主题/图标通过设计源生成。具体约定见 [代码规范](docs/02-standards/coding.md)。

保留现有作者与 MIT 声明，新文件遵循仓库作者头规则，可增加贡献者署名。不要手改生成文件或混入无关格式化。贡献内容须有权按本仓库 MIT 许可提供，不引入不兼容的第三方代码、图片或字体。

## 验证与 PR

```sh
make docs
make test
# 按实际影响执行
make build-web build-cli build-ops
pnpm exec playwright install chromium
make test-e2e
# 原生桥接或桌面 UI 改动，在对应系统运行
make build-desktop
```

外部数据库测试只使用显式提供的隔离库，参数见 [CI](.github/workflows/ci.yml) 和 [备份手册](docs/03-runbooks/backup.md)。修改数据库、文件或恢复逻辑时，还需覆盖目标方言、权限、失败恢复和已有数据兼容；新 UI 验证 PC/375px、主题及操作流程。仅文档修改无需重跑原生窗口或部署；如实填写已执行和未执行项目。

提交 PR 时使用仓库模板，包含问题、四个 profile 的影响、验证证据、迁移/恢复说明。用户可感知的改动写入 [CHANGELOG](CHANGELOG.md) 的 Unreleased，相关规范/运行手册同步更新，重大决策新增 ADR。维护者审阅后合并；不要自行发布 tag、Release、镜像或向真实外部服务发送消息。

交流遵守 [行为准则](CODE_OF_CONDUCT.md)。维护者会按影响与资源安排处理，不承诺固定响应时间。
