<!-- Author: yunnuo <ymz@ebox.vip> -->
# 平台公告与内容管理

仅在线多用户 web-platform 提供公告。管理员在“系统管理 → 平台公告”管理，用户工作台通过注册 widget 展示。默认开启展示；关闭后用户列表返回 enabled=false、空列表，详情返回 404，刷新或下一次轮询后卡片隐藏。普通用户无管理菜单，管理 API 仍独立拒绝普通会话，不能通过改地址获得权限。单机、Wails 和 CLI 无公告管理、表或请求。

新增和编辑使用弹窗，支持 500 个 Unicode 字符的 Markdown/HTML、四种语义类型、发布时间、草稿/发布和 100 字内部备注。未来时间发布为定时公告，到期后直接进入用户查询，无需定时任务。草稿不公开；内部备注不会发送给用户。预览由后端同一渲染器生成，脚本、外链图片、内嵌页面、事件和样式被禁止；Markdown 链接仅允许安全 HTTP(S)。请勿把正文或备注拼接到危险 HTML 属性。

列表支持关键词、发布状态、固定排序、分页、勾选本页和批量删除。批量删除在一个事务内检查所有版本，任一过期则全部回滚；刷新列表后重新选择。删除是软删除，但当前没有业务恢复入口，用户随即无法继续读取。客户端旧详情缓存不能作为下一次访问授权。

用户端使用紧凑单行公告条，默认只展示一条摘要，去掉独立大标题区、说明和列表留白。多条公告每 5 秒向上轮播，支持暂停/继续、手动下一条及跨页循环；鼠标悬停、键盘焦点、详情打开或标签页隐藏时暂停，系统减少动态效果时仅手动切换。单条静态显示，无动画或轮播控件；没有有效公告、加载中或管理员关闭展示时不渲染公告条，也不保留 widget 间距。接口失败才显示紧凑的错误重试行。长文省略，点击后由详情弹窗展示完整内容并重新鉴权。正文为业务数据，切换界面语言不会翻译公告或邮件模板。邮件默认主题与正文固定中文；管理员可以任意编辑，界面按钮、校验和消息仍中英双语。

主要入口：domain/{entity,announcement}.go，usecase/announcements.go，adapter/storage/announcementsql，adapter/content/announcement.go，adapter/http/announcements.go；前端 announcements-page、announcements-card、rich-content，SDK 统一使用生成 operation。设置键 announcements.enabled 注册于 SettingDefinition 且只由公告专用端点修改，不能通过通用 settings PATCH 绕过。

本轮迁移为平台 0011、业务 0002；所有原有记录保留，笔记历史行默认活跃。首次启动自动执行增量迁移，不重装；先停机备份，恢复见 [备份手册](backup.md)。自动 OTA 只允许相同迁移级别，不能将这次 DB 变更视为无迁移在线替换。MySQL DDL 隐式提交，失败后用同版本重试；回退先恢复完整备份。

验证：Go 集成测试覆盖 SQLite，设置 UNICORE_ANNOUNCEMENT_MYSQL_DSN / UNICORE_ANNOUNCEMENT_POSTGRES_DSN 可在独立空库执行同一公告套件；既有 platformsql 套件使用另一对 UNICORE_TEST_* DSN，禁止多个测试包争用同一库。浏览器测试见 tests/e2e/announcements.spec.ts，含真实双身份域、375px、英文深色、持久化及本地形态无请求。验收结果见 [本轮报告](../04-ai/acceptance-announcements.md)。
