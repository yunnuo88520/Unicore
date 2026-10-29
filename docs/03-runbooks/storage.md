<!-- Author: yunnuo <ymz@ebox.vip> -->
# 文件存储配置与开发

只在 web-platform 装配。系统管理 → 对象存储，默认“本地”，云位置不会自动启用。

1. 在服务商创建私有 Bucket；使用限定 Bucket/前缀的读、写、复制、删除凭据。
2. 在对应提供商标签“新增存储位置”，填写 API Endpoint、Bucket、Region、独立前缀与密钥。OSS 使用地域如 cn-hangzhou；COS Endpoint 填完整 Bucket 域名；S3 支持路径式寻址；MinIO Endpoint 填 API 端口，不能填控制台地址。
3. 保存后“测试连接”，通过后“配置本站跨域”。S3/OSS/COS 合并新规则，保留原规则；部分 MinIO 使用服务级 CORS，当前已允许本站时直接检查通过，否则需运维配置服务允许站点 Origin。不要开启公共桶策略。
4. “设为默认”后刷新页面，以加载允许目标 Origin 的 CSP。历史文件仍走原位置；不删除旧位置/密钥/本地目录。
5. 在“文件大小与生命周期策略”设置大小、签名时效与保留期。默认单文件 100 MiB，最高 64 GiB；签名下载 300 秒，上传凭证 900 秒，未完成上传保留 24 小时；新文件永久保留（0）。分片默认 8 MiB（5–64），并发默认 3（1–6）；可暂停、继续或放弃，未完成记录按保留期清理。策略只作用于新建会话。

HTTPS 站点必须使用浏览器可达的 HTTPS Endpoint；不要在公网页面使用仅服务器能访问的内网域名。Nginx 本地上传需要 client_max_body_size 与 proxy_read_timeout 对应上限；云直传不经过 Nginx/应用服务器。本地 multipart parts 路径每次最多 64 MiB、10 分钟；完成合并最多两小时。参考 deploy/tar/nginx.conf.example 的专用上传 location；不用将所有 JSON 请求上限一起放大。

配置密钥使用原实例 AES-GCM 密钥加密。API 不回传 Access Key/Secret Key，编辑留空保留。Endpoint/Bucket/Region/前缀是历史引用的一部分，换目标新增位置；有文件/使用中位置的凭据轮换先验证新值。凭据失败不会提交替换。桶权限测试失败只显示安全错误码，不回显服务商响应。

## 业务接入

业务保存 file_id，调用 files.Service，不拼接 uploads 路径或保存下载 URL。字节操作通过 internal/blob.Store；本地路径只在组合根和 bloblocal adapter 出现。HTTP DTO/operation 从 OpenAPI 生成，React 调用 AppClient.files.uploadFile / fileAccess；SDK 发云请求时 credentials=omit，不转发平台 Cookie、CSRF 或身份头。

文件元数据包含 file_id、original_name、storage_type、location_id、file_key、mime_type、size、creator_id、creator_realm、创建/到期时间和状态。普通用户只能操作本人身份域文件，管理员可操作所有用户文件。云 URL 是短期 bearer，过期前持有者可下载；不能当作可撤回的永久权限。文件强制附件下载，上传 HTML/SVG 不在应用源执行。品牌为管理员公开发布的规范化 PNG，由既有 /brand-assets 路由提供当前引用，是私有文件机制的明确例外。

## 迁移、清理与恢复

文件管理 → 迁移，选择已测试目标；传输和 SHA-256 校验成功才切换元数据，文件 ID 不变。跨提供商迁移会流经服务器；日常云上传/同桶确认直接发生在浏览器/对象存储。旧对象至少延迟 3660 秒清理，为已经签发的下载预留窗口。失败时保留原文件，目标孤儿由事先登记的任务清理。

后台使用独立分钟定时器处理有限批次的到期元数据/清理任务，可在页面立即执行。删除失败会保留任务并延迟重试。应用只清理 DB 登记的键，不扫描整桶；桶内其他业务数据不接管。未完成直传对象等凭证到期/保留期后清理，防止晚到请求再次产生孤儿。建议为独立 pending / multipart 前缀增加桶生命周期后备规则，并启用桶版本/备份；规则由桶运维维护，不替换无关规则。

升级前备份 DB、完整私有数据目录、实例密钥与对象桶；0009 仅在线平台新增三表及文件归属、分页、到期与清理任务索引。SQLite/PostgreSQL 事务 DDL，MySQL IF NOT EXISTS 可重试；回退需恢复匹配快照，数据库恢复不能复原已经清理的对象。旧品牌本地文件惰性登记为 legacy-brand 位置，保留旧目录直到另行完成迁移/备份。

## 验证

`make docs && make test && make build-web`；页面运行 `pnpm exec playwright test tests/e2e/storage.spec.ts --workers 1`。真实云验收通过 UNICORE_TEST_MINIO_ENDPOINT / ACCESS_KEY / SECRET_KEY / BUCKET 注入（后面三个完整名称带 UNICORE_TEST_MINIO_ 前缀），不要写进 .env、文档或仓库。页面云测试前先 `go build -o build/bin/storagefixture ./tests/storagefixture`；Go 集成 `go test ./internal/files -run TestMinIO -count=1`。测试只创建专属前缀并清理；不更改公共读或删除桶。未提供服务商环境时不声明 OSS/COS/AWS 云端实测。

## 分片与断点续传

平台用户和管理员共用 FileUploadDialog 与 AppClient.files.uploadFile。新文件统一分片，小文件为一片；页面显示已确认字节进度、暂停、继续、放弃。刷新、关闭或服务重启后，在未完成文件旁点击“继续上传”，重新选择原文件即可；文件指纹不符会拒绝继续，不会创建另一份覆盖原文件。超过续传窗口后需删除记录并重新上传。网络失败自动重试两次，签名过期时重新申请；需要保持原位置和凭据可用。

调用 `uploadFile(file,{resumeId,onSession,onProgress,onStage,signal})` 可在业务组件复用；onStage 为 hashing/uploading/confirming，onProgress 仅统计已被存储确认的字节，按片推进。AbortSignal 表示暂停，不删除服务端会话；放弃用 deleteFile。不要自行拼对象键、缓存上传凭证或在 UI 保存身份令牌。普通用户 policy 只含大小/分片/并发/续传期，不泄露全局设置、位置或密钥。

云账号新增所需权限：原生 multipart initiate、upload part、list parts、complete、abort，以及对专用前缀列举未完成 multipart（清理崩溃时丢失的 upload ID）、条件复制/分片复制、读写删除。S3/MinIO 对应 ListBucketMultipartUploads、ListMultipartUploadParts、AbortMultipartUpload、PutObject/GetObject/DeleteObject；OSS/COS 配置等效权限。测试连接同时探测 initiate/list/abort，真实上传与厂商测试仍需环境验收。云跨域必须允许 PUT 和 Content-Type；不要设置公共读。

迁移 0012 追加 file_upload_sessions，平台 schema=12；完整 DB 备份必须包含它。本地分片在私有数据目录下的 multipart 命名空间，跟随完整 data 备份，不能只备份已完成文件。云端未完成分片不属于普通对象备份：恢复时以原 upload ID 是否仍可用为准，不可用会话需放弃后重传。清理按登记的精确键 abort 再 delete，失败持久重试，不清空 Bucket。大对象服务端复制也受相同孤儿清理保护。

设计见 [ADR-0022](../adr/ADR-0022-resumable-uploads.md)，本轮真实环境和未验证事项见 [续传验收](../04-ai/acceptance-multipart.md)。旧单请求上传 API 保留且最高 1 GiB，不提供断点续传。

OSS 实测已覆盖官方 SDK 和 PC/375px 浏览器，当前适配将服务端操作与绑定 Content-Length 的签名客户端隔离；下载只覆盖 Content-Disposition 为附件，避免 OSS 拒绝 response-content-type 覆盖。腾讯云开发凭据本轮返回 AccessDenied，用户选择待权限补齐后验证；AWS S3 仍未做真实账号测试，不能因为 MinIO 同协议而声明 AWS 通过。

额外云环境使用 UNICORE_TEST_OSS_* / UNICORE_TEST_COS_* 的 ENDPOINT、BUCKET、REGION、ACCESS_KEY、SECRET_KEY 注入；Go `go test ./internal/adapter/blobcloud -run TestVendorMultipart -count=1`。测试只使用 unicore-acceptance-* / unicore-browser-* 随机前缀，密钥不落源码、报告或 trace。浏览器测试对同一桶的 CORS 采用串行（--workers 1），避免不同隔离实例同时 read-modify-write 覆盖临时 Origin；结束只移除本次临时 Origin，保留其他规则。不要并发运行多套修改同一桶 CORS 的验收。
