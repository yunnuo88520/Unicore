<!-- Author: yunnuo <ymz@ebox.vip> -->
# 第一个功能：给笔记增加标签

完成后，你可以在新建/编辑笔记的弹窗填写一个最多 32 字符的标签，保存、刷新或重启后仍能看到；已有笔记的标签为空。本文在自己的派生项目上完成一次契约、数据库、共享业务、Web/桌面界面和验证的修改。

## 准备一个自己的项目

准备 [使用指南](index.md) 要求的工具，在框架源码目录创建一个新的练习项目：

```sh
pnpm create:project --directory ../notes-lab --name 'Notes Lab' --slug notes-lab --module example.com/notes-lab --bundle com.example.noteslab
cd ../notes-lab
make install
make dev-server
# 第二个终端，在 notes-lab 目录
make dev-web
```

用 Platform + SQLite 完成安装，创建一条“修改前”的笔记，记住内容。停止两个开发进程，再做下列修改；保留练习项目的数据目录。练习也适用于 Standalone 两载体，CLI 不装配笔记或数据库。不会增加账号、文件服务或新的权限点，继续复用 notes:create/update/delete 与服务端 owner 校验。

## 应用可运行示例

示例程序只修改新派生项目，拒绝直接修改上游 Unicore、重复应用或覆盖已有笔记追加迁移。先提交/保存自己的改动，然后在派生项目中运行：

```sh
node examples/notes-tag/apply.mjs .
pnpm generate
pnpm generate:migrations
gofmt -w internal/modules/notes
# 查看全部变更，包括新文件
git status --short
git diff
```

这是可阅读、可替换的教程辅助程序，不是框架运行时依赖。你也可以按以下步骤手工实现；完整修改在 examples/notes-tag/apply.mjs，程序会先检查所有源码定位点，再写文件。示例不改旧 version=1 SQL，不连接或修改数据库；下次正常启动才由迁移执行器应用 version=2。

## 1. 从契约开始

在 packages/contracts/openapi.json 的 NoteInput、NoteUpdate、NoteEntry.properties 增加同一个字段：

```json
"tag": {
  "type": "string",
  "maxLength": 32,
  "x-go-value": true,
  "description": "Optional single note tag; empty means no tag."
}
```

不把 tag 加入 required，允许旧调用者省略。x-go-value 使 Go 使用空字符串零值，TypeScript 保持可选字段。运行 pnpm generate，让 Go/TS DTO、校验规则和接口参考一起更新；SDK 已复用生成 DTO，不需要手工加另一份请求模型。原来的路径和 x-unicore 权限策略不变。

## 2. 追加自己的数据库迁移

为 module.notes 的 sqlite、postgres、mysql 各新增 0002_tag.sql，并在 migrations/catalog.json 的该命名空间追加 version=2 与三个文件路径：

```sql
-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: optional note tag; Web database profiles and SQLite desktop.
-- Compatibility: append-only module.notes@2; existing notes receive an empty tag.
-- Recovery: restore a matching pre-upgrade DB/data/key/binary snapshot; no down SQL.
ALTER TABLE unicore_example_notes ADD COLUMN tag VARCHAR(32) NOT NULL DEFAULT '';
```

运行 pnpm generate:migrations，检查 metadata.gen.json 中 module.notes 变成 2。旧 core/platform 版本与 checksum 不应改变。SQLite 的 VARCHAR 不限制实际字符数，后端校验仍然必须存在。MySQL 的 ALTER 可能隐式提交，失败恢复使用升级前完整快照，不删账本重试；[迁移规范](development.md#数据库迁移与文件) 说明各方言边界。

## 3. 连接领域、用例与仓储

在 internal/modules/notes/domain/note.go 给 Note 增加 Tag，并用 utf8.RuneCountInString 校验长度；空标签合法。在 usecase/notes.go 的 validate 中调用它，Update 转成 NoteInput 时也传 Tag，确保 HTTP 和 Wails 都不能绕过校验。

在 storage/notessql/repository.go 把 tag 加入 columns 的末尾，同时补齐 scan、领域到 DTO 映射、Create 的 INSERT 参数与 Update 的 SET 参数。占位符数量必须与参数一一匹配。标签变化只在审计详情记录字段名 tag，不记录用户内容。

保留 scope_key、deleted_at 和 version 条件：本人的可编辑笔记更新标签后版本递增；过期版本仍返回冲突，普通用户不能借新字段编辑他人资源。不要把 owner 加到请求 DTO，也不要在 usecase 引入 SQL 或身份模块。

## 4. 复用共享界面并同时提供双语

在 packages/web-ui/src/modules/notes/notes.tsx 的 NoteValues 增加 tag，defaultValues 使用 note?.tag ?? ''，提交继续走现有 AppClient。编辑器使用现成表单：

```tsx
<AppField name="tag" label={t('笔记标签')}>
  <Input maxLength={32} />
</AppField>
```

卡片中有标签时用 Badge 显示 note.tag。packages/web-ui/src/locales/en.json 同时登记“笔记标签”对应 Note tag；不翻译用户填写的标签。页面已有 useLocale，继续复用 WorkspaceLayout、表单验证和消息组件，无需增加侧栏或新路由。Web 与桌面共用此页面。

## 5. 检查结果并体验带数据升级

```sh
go test ./internal/modules/notes/... -run TestTutorialTag -count=1
pnpm typecheck
pnpm check:i18n
make docs
make test
make build-web build-cli build-ops
```

示例新增的 tag_example_test.go 验证保存/读取、更新、32 字符限制、过期版本和跨 owner 拒绝。全量测试继续覆盖原有功能；改动测试夹具时不能削弱原断言。真实三方言与原生桌面仍需按自己的发行目标验证，SQLite 单测不能代表其他系统。

重新启动前面的开发命令。先看“修改前”的笔记：正文保留、标签为空；编辑成 learning，保存、刷新、重启后应仍为 learning；切换英文确认显示 Note tag。用两窗口编辑同一条笔记确认旧版本写入被拒绝。授权角色、双视口与附件规则继续沿用 [笔记样板](development.md)。

真实产品升级前停服并 [备份](backup.md)，在隔离副本走一遍上述旧数据到新列流程。此例追加迁移会改变 Catalog 指纹，因此 OTA 自动安装拒绝这个版本是预期行为；人工部署后启动 runner 应用缺失尾部。回退必须恢复旧快照和旧程序，不能只删除 tag 字段或换旧二进制。

完成后为自己的产品更新功能清单、支持范围与变更记录。更大模块沿用 [应用开发指南](development.md)，框架合并与冲突处理见 [跟进上游](framework-upgrade.md)。
