<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0043：业务上传与存储管理分离

状态：已接受。维护者明确原文件管理页面仅为验证本地/对象存储的测试入口，不是产品功能；头像、笔记附件等真实业务必须能上传。本文裁决 D1/D12，补充 D16，并替代 ADR-0015 中“文件服务仅平台装配”的范围限制。

## 决策

存储位置、云凭据、默认存储和上传策略是 Platform 管理能力；测试文件管理页继续移除。业务上传依据业务主体和用途授权，不要求用户拥有通用 files:* 或 storage:* 管理权限。

- 头像：本人账号会话，独立 avatar 归属域。创建限制为 PNG/JPEG/GIF、2 MiB；完成和保存资料时校验实际图片内容、尺寸、状态与本人归属。不能把笔记或别人的文件 ID 保存为头像。
- 笔记：上传 helper API 复用 notes:create/update，列出和下载复用 notes:access；菜单、动作和 operation 显式授权仍独立。上传和未关联文件列表限本人；跨用户下载必须给出可读取笔记的 note_id，且文件确实被其引用。修改笔记只接受本人 ready 附件，超级管理员的业务上传也不绕过归属。
- Standalone：Web 和桌面均装配本地 files 服务，使用 local 主体，支持笔记上传、引用校验、重启续传、下载与清理；不装配账号、角色或云 SDK。Web 沿用 sameOrigin，本地可达就是访问边界；远程部署另设外层访问控制。
- 桌面通过 Wails 原生桥分片传输，不启动 HTTP 服务。下载由系统保存对话框选路径，先写同目录临时文件再替换；前端只传 file_id。两个载体的业务语义相同，传输及下载呈现属于载体差异。

## 持久化与恢复

四张文件基础表及固定 local 位置记录从开发期 platform@1 移入 core@1，platform@1 保留 legacy-brand 位置。仍为三命名空间、九个方言 SQL；Platform 表结构不变，Standalone 增加本地附件基础表。此调整在首个 stable 前完成，现有开发库需重建或从匹配快照恢复，不承诺旧开发基线自动升级。首个 stable 后只追加迁移，遵循 ADR-0042。

本地 bytes、未完成分片、元数据和实例签名密钥须一起备份。Web/桌面均按分钟清理有限批次、失败重试，退出先停止清理再关闭数据库。桌面文件服务使用同源 secret.Store；当前 Standalone 没有实例级敏感设置，D4 的设置扩展前置条件仍保留。

## 功能声明：business-files 业务上传

- 功能领域/归属层：文件存储基础设施及业务模块，产品功能。
- 操作对象：本人头像、本人笔记附件；不提供通用文件管理页。
- Platform：用户及管理员工作台共用账号；头像本人会话，笔记复用 notes 权限及显式操作授权，存储治理维持 storage 权限。
- Standalone：Web/GUI 两载体等效，单本地主体，无角色、云管理或额外设置页。
- CLI：不装配文件、UI、数据库或原生桥。
- 持久化：复用文件四表并归入 core@1；不新增设置定义。
- 契约：新增 notes* 与 avatar* multipart/list/access/delete operation，分别位于 /notes/files 和 /account/avatar/files；SDK businessFiles(scope) 提供相同 FileClient。
- 菜单/页面/仪表盘：沿用个人资料与笔记页内上传弹窗，无新增菜单或 widget。
- 环境：Platform 默认本地，可使用管理端启用的云存储；Standalone 固定本地。桌面仅 SQLite，Web 使用已验证方言。
- 关联：FileUploadDialog、files.Service、blob ports、持久上传会话及完整快照。
- 待决策事项：无；D1/D12 已由维护者本次澄清裁决。

## 验证

验证普通账号无 files:* 时修改头像与笔记附件、伪造图片/超限拒绝、跨用户及跨业务域访问拒绝、业务权限撤销、签名下载、重启续传及完整备份恢复；共享界面覆盖 PC/375px，桌面使用真实原生桥与保存对话框。无真实云账号不声明云端验收。
