<!-- Author: yunnuo <ymz@ebox.vip> -->
# 笔记模块源码导读

个人笔记是可选业务 demo，用于展示一个模块如何接入契约、用例、数据库、权限和共享界面。可以参照它开发自己的模块，也可以按 [功能裁剪](../product/features.md) 直接关闭。

Web 与桌面复用 React 页面和 Go 用例，分别通过 HTTP 与 Wails 调用。示例包含创建、编辑、搜索、分页、删除和附件上传；界面操作见 [示例应用使用说明](../product/workspace.md)。

## 源码入口

| 层 | 入口 |
| --- | --- |
| 契约 | `packages/contracts/openapi.json` 的 Note schema、CRUD 与附件 operation |
| 模块描述符 | `internal/modules/notes/module.go`，由 `internal/module/manifest.json` 登记 |
| 领域与用例 | `internal/modules/notes/domain/note.go`、`internal/modules/notes/usecase/notes.go` |
| SQL port 实现 | `internal/modules/notes/storage/notessql/repository.go` |
| 分方言迁移 | `migrations/modules/notes/{sqlite,postgres,mysql}/0001_initial.sql` |
| HTTP | `internal/adapter/http/notes.go` |
| Wails 桥贡献 | `internal/modules/notes/desktop/notes.go` |
| SDK 与页面 | `packages/sdk/src/index.ts`、`packages/web-ui/src/modules/notes/` |
| 存储与页面测试 | `internal/modules/notes/storage/notes_test.go`、`tests/e2e/notes.spec.ts` |

## 资源归属与并发编辑

服务器确定资源归属：Platform 使用当前账号的用户 ID，Standalone 使用 `local`。切换用户与管理工作台不改变本人资源归属。请求不能自行提交 owner；未获授权的跨用户资源访问返回不存在。

角色的数据范围可扩展列表读取范围，普通用户的写操作仍校验本人归属。管理工作台的超级管理员可通过每次请求的 `ManageAll` 授权管理用户笔记。

标题最多 120 字符，正文最多 5,000 字符，每条笔记最多关联五个本人已就绪的附件，列表每页 20 条。更新和删除发送读取时的 `version`；版本过期返回 `NOTE_CONFLICT`，客户端应重新读取后再编辑。

笔记使用 `BaseEntity` 生命周期。`module.notes@1` 包含 `deleted_at`；读取和更新排除已删除记录，删除时原子递增版本。审计记录动作与操作者，不记录笔记正文。

## 附件生命周期

附件保存 `file_id`，下载时获取经过鉴权的临时签名链接。Platform 使用笔记权限与附件 helper API 授权，不要求 `files:*` 管理权限；Standalone 使用本地文件服务。

移除附件引用或删除笔记会保留文件。笔记引用不会延长文件保留期，也不会阻止文件被删除；业务需要强引用时，应在文件生命周期 port 中增加事务检查。存储和上传规则见 [文件存储](../product/storage.md)。

## 角色与权限示例

以下示例适用于 Platform，不是框架内置角色。由超级管理员在“角色权限”中新建角色，再分配给测试账号。页面、动作、API 与数据范围分别授权，多角色取并集。

### 笔记只读

授予“我的笔记”页面、`notes:access` 和 `listNotes`，不授予新增、编辑、删除动作。允许下载附件时，再授予 `notesFileAccess`；服务端仍校验笔记读取范围和真实附件关联。

### 本人笔记编辑

在只读角色上增加新增、编辑、删除动作，授予 `notes:create/update/delete` 和 `createNote`、`updateNote`、`deleteNote`。`self` 范围不允许编辑他人的笔记。

### 笔记附件编辑

增加“上传文件”动作、`notes:create/update`，并授予以下附件 operation：

- 列表与策略：`notesListFiles`、`notesFileUploadPolicy`。
- 分片上传：`notesCreateMultipartUpload`、`notesMultipartUpload`、`notesSignUploadPart`、`notesUploadLocalPart`、`notesCompleteMultipartUpload`。
- 放弃上传与下载：`notesDeleteFile`、`notesFileAccess`。

默认 `user` 角色已有这些业务能力。上传使用持久分片流程，小文件也需要完整的 helper API 授权。云端 PUT 使用签名 URL，服务器校验归属与完成状态。移除已保存笔记中的附件只移除引用；放弃上传需要 `notesDeleteFile`。

### 受限管理工作台

「我的笔记」仅在用户工作区呈现，「笔记管理」仅在管理后台业务区呈现，不能通过菜单编辑扩大工作台范围。委派笔记管理页面时，同时授予管理后台入口 `admin:access`、页面及祖先菜单，以及实际需要的 `notes:manage:*` 权限和 operation；普通用户默认不获得内容管理权限。API 授权与页面工作台独立，数据范围和资源校验始终在服务端生效。

只授予实际需要的管理页面、动作和对应 admin operation，按策略的 `all/any` 条件授予权限点。标为 `super_admin` 的账号、角色、更新等操作不可委派。保留内置超级管理员权限集，不通过全选 API 目录配置最小权限。

## 排查权限问题

使用受限测试账号重新登录，确认角色与当前工作台，再按现象检查：

| 现象 | 检查 |
| --- | --- |
| 页面不可见或直达 403 | 菜单及祖先节点是否启用、工作台 `surfaces` 与路由权限 |
| 页面可见但按钮不显示 | 权限点、`action_ids` 和动作关联的 `operation_ids`；显式空动作列表表示撤销 |
| 请求返回 401 | 会话是否过期或已撤销 |
| 请求返回 403 | API grant、`all/any` 条件、超级管理员保留策略、CSRF/Origin；在 Network 中查看错误码 |
| 列表正常但不能编辑或下载某条记录 | owner、数据范围与记录的 `capabilities` |
| 保存返回 409 | 并发版本冲突，重新读取后再编辑 |

菜单授权不会授予 API 或绕过资源归属。角色变更可能撤销会话，修改后重新登录，分别检查页面可见性、允许的操作和应被拒绝的直接 API 调用。

## 添加自己的业务模块

先修改 OpenAPI 并执行 `pnpm generate`，再实现领域、用例、存储、传输入口、页面和权限测试。领域层不依赖平台身份，CLI 不接入数据库；分层规则见 [后端参考](../02-standards/backend.md)。

笔记以 `module.notes` 命名空间接入统一 Catalog 和迁移执行器。自己的模块使用独立命名空间，后续追加连续版本，并提供各方言 SQL、兼容与恢复说明。已交付的 SQL 保持原字节和 checksum。

裁剪回归使用 `pnpm test:notes`，覆盖前后端装配、API 404、页面产物和 SQLite 数据保留。已有实例的菜单回归还会验证同一会话跨构建保存配置、角色授权保留与版本冲突；可通过 `UNICORE_NOTES_TEST_POSTGRES_DSN`、`UNICORE_NOTES_TEST_MYSQL_DSN` 接入各自独占的空测试库。另为关闭模块的全新安装阶段提供 `UNICORE_NOTES_TEST_POSTGRES_FRESH_DSN`、`UNICORE_NOTES_TEST_MYSQL_FRESH_DSN`，须与已有实例回归使用不同的空库；脚本只清理临时数据目录，外部测试库由调用者创建和清理。未提供对应 DSN 时跳过该方言，SQLite 结果不代表外部数据库。具体关闭和永久移除步骤见 [裁剪示例与可选能力](../product/features.md)。
