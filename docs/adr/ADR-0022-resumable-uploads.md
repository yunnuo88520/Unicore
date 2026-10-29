<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0022：统一上传策略与持久分片会话

状态：采用。补充 ADR-0015 的单请求上传，不改变文件权限或其他 profile 的装配。

只影响 web-platform。管理员在对象存储页可直接编辑本地/MinIO/S3/OSS/COS 共用的大小、分片、并发及生命周期策略；普通用户只读取专用 policy 的安全投影。默认单文件 100 MiB，可设置 1–65536 MiB；分片默认 8 MiB（5–64），并发默认 3（1–6），续传窗口默认 24 小时（1–168）。新策略只作用于新建会话；已接受文件的大小、分片几何和到期时间固定，切换默认位置也不影响续传。为不超过 10000 片，必要时自动增大实际分片。

`blob.Multipart` 是 Store 的可选能力，封装 begin/list/sign/complete/abort；本地额外实现 PartReceiver，根目录约束与字节操作仍只在 adapter。会话 `file_upload_sessions` 只保存 file_id、云原生 upload ID、内容指纹和分片大小，文件元数据继续管理归属、固定位置、状态与生命周期。服务端从存储实际列举分片，核验序号、长度和 ETag，拒绝缺片、越界、异常长度；不信任浏览器上报已完成片。长流不占用全局元数据锁，确认采用有界文件锁，写状态前复核未删除，避免并发取消后复活。

SDK 对完整文件做流式 SHA-256，固定 8 MiB 内存块；使用成熟 SHA 库兼容内网 HTTP 的非 secure context。恢复必须重新选择同名、同大小、同 MIME、同内容的原文件；刷新后浏览器无法自动重新读取磁盘文件。File 对象与任何签名 URL 不写 localStorage，恢复入口来自服务端文件列表。上传进度是服务器/云端已确认的字节数，按分片推进；最多两次自动重试，每次重新申请短期签名。暂停仅中断本次浏览器请求，保留已完成片；显式放弃调用现有文件删除，禁止继续签发，临时数据进入清理队列。

云端使用官方 SDK 的原生 multipart PUT，浏览器不带应用 Cookie/CSRF；本地分片先临时写、同步、原子改名，合并逐片流式读取并校验 SHA-256，不把完整文件载入内存。云端合并核对实际长度/类型后，以 ETag 条件复制到新正式键；大对象使用服务端分片复制，避免单次复制限制，也不将文件代理回应用。旧签名始终只能写 staging；确认成功或 abort 后不能覆盖正式文件。处于 copying 的确认可在存储完成而 DB 未提交时重试。

元数据与清理任务必须在任何 multipart begin 或对象写入前持久化。Begin 的 upload ID 响应可能在崩溃时丢失，故清理 adapter 对 DB 登记的精确键枚举并中止所有未完成 upload，再删 staging/孤儿正式对象；列表的 prefix 仍须严格比较完整 key，不接管其他对象。失败保留任务，延迟重试；取消后等待既有签名失效，过期记录先变为不可访问。连接测试增加 initiate/list/abort 权限探测。云 IAM 需允许对应 multipart/list/abort/copy 权限，CORS 需允许 PUT。桶 lifecycle 可作为运维后备，程序不改其规则。

平台迁移 0012 仅追加会话表，SQLite/PostgreSQL 事务 DDL，MySQL IF NOT EXISTS 可重试；旧 checksum 不变，本地 framework=1/business=2 不变，平台=12。回退前停服，恢复匹配 DB、data、实例密钥、二进制与桶快照；旧二进制不支持续传，不应在进行中的会话上运行。跨 schema OTA 仍需备份后人工部署。

旧单请求 API 保留兼容，最高 1 GiB；新 SDK 默认统一分片。分片请求每次最多 64 MiB、10 分钟，确认最多两小时。反代须同步设置 body/timeout 并关闭流式上传的请求缓冲。64 GiB 是配置/协议上限，验收数据量与云厂商范围见 [本轮验收](../04-ai/acceptance-multipart.md)，不代表已经做满额性能压测。
