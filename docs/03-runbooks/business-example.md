<!-- Author: yunnuo <ymz@ebox.vip> -->
# 从个人笔记开始开发业务

笔记是可运行、可替换的纵向样板。Web 安装后点击“我的笔记”，新建和编辑均为弹窗；支持搜索、状态、排序、分页和删除。桌面使用相同 React 页面及 usecase，通过 Wails 调用。平台本人文件先在“我的文件”上传，再在笔记弹窗选择；单机和桌面没有平台文件能力。

| 层 | 入口 |
| --- | --- |
| 契约 | packages/contracts/openapi.json 的 Note* 与八个用户/admin operation |
| 业务规则 | internal/domain/note.go、internal/usecase/notes.go |
| SQL port 实现 | internal/adapter/storage/notessql/repository.go |
| 分方言迁移 | migrations/{sqlite,postgres,mysql}/business/0001_notes.sql |
| HTTP / Wails | internal/adapter/http/notes.go、internal/adapter/desktop/notes.go |
| SDK / 页面 | packages/sdk/src/index.ts、packages/web-ui/src/notes-page.tsx |
| 数据库 / 页面验收 | internal/adapter/storage/platformsql/notes_test.go、tests/e2e/notes.spec.ts |

服务器固定 scope：user/id、administrator/id 或 local。请求不能提交 owner，猜中另一账号的 id 仍返回不存在。标题最多120字符，正文5000字符，最多5个同身份域本人 ready 附件。列表每页20条。更新与删除须发送读取时 version；过期版本返回 NOTE_CONFLICT，关闭编辑后刷新再处理，防止静默覆盖他人或另一窗口的更新。

附件保存 file_id，不保存永久 URL；下载仍走鉴权后的临时签名。笔记引用不会延长文件保留期或阻止用户删除文件，业务需要“附件强引用”时应在文件生命周期 port 增加事务检查。删除笔记不删除文件；失效附件会按文件服务错误反馈。

新增业务时按 add-go-module/add-api-operation/add-react-page Skills：先改 OpenAPI、pnpm generate，再实现 domain/usecase/SQL/入口/页面与权限测试。不要复制平台身份到 domain，也不要为复用业务把数据库接入 cmd/cli。审计仅写动作与操作者，不记录笔记正文。

business_migrations 与框架迁移独立。后续添加连续版本、逐方言测试和恢复说明；已经交付的迁移不可改 checksum。要移除样板，可在新项目首次交付前移除 Note* 契约、入口装配、SDK/page/导航、迁移和 MigrateBusiness 调用，并重新生成与跑全部检查。已有实例不得直接删迁移或删表，应另写有备份的向前迁移。

当前笔记通过 BaseEntity 统一生命周期，业务迁移 0002 添加 deleted_at；列表/更新排除已删除行，删除原子递增 version，附件元数据原文件保持其自身生命周期。新增业务遵循 [后端规范](../02-standards/backend.md)。
