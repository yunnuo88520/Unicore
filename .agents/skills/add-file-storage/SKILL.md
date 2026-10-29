---
name: add-file-storage
description: 扩展 Unicore 文件业务、存储提供商、直传或签名下载，保持 file_id 元数据与生命周期边界。
metadata:
  author: yunnuo <ymz@ebox.vip>
---

# 文件存储开发

先读 [ADR-0015](../../../docs/adr/ADR-0015-file-storage.md) 和 [存储手册](../../../docs/03-runbooks/storage.md)。业务使用 internal/files 与 file_id，字节操作经 internal/blob.Store，不拼本地路径、不保存临时 URL 作为引用。

- 新提供商实现 blob adapter 与官方 SDK 签名；在 install 组合根注入 Factory，仅平台装配，桌面/CLI 不导入云 SDK。位置目标不可原地更改，密钥加密且不回传；更换目标新增位置，历史文件按 location_id 访问。
- 直传只签 staging key，核验长度/类型后按 ETag 条件复制到正式 key，再提交 ready。先登记孤儿清理任务；不直接签可覆盖已完成文件的 key。云 SDK 请求不携带平台 Cookie/CSRF。用真实浏览器验证 CORS/CSP，HTTPS 页面不能配 HTTP 目标。
- 本人权限包含 creator_realm，管理员权限由 HTTP 独立校验。私有下载先鉴权再签短链接；本地每次校验签名/状态，云链接在 TTL 内仍是 bearer。规范化公开品牌是既有显式例外，不能借此公开任意文件。
- 迁移先复制和摘要校验再换引用，保留 ID，旧对象等既有链接过期后清理。处理失败/崩溃重试与凭证过期后的临时对象；不扫描/清空用户 Bucket 或覆盖无关桶配置。

接口/DTO 改 OpenAPI 后生成，设置登记 Definitions，SQL 变更提供三方言迁移。UI 使用 AppClient、单层提供商 Tabs、新增实体弹窗和 useMessage。测试本地、权限/身份域、签名过期、重复完成、直传重放、失败与重启；云端只使用当前任务授权的专属前缀，凭据通过测试环境注入，不持久化 trace。无真实账号的提供商明确未做云端实测。

运行 make docs、make test、make build-web 与 storage.spec.ts；品牌接口变化同时验证原生 Wails，不用 HTTP 模拟。新增位置或测试实例不等于授权修改生产桶/发布部署。

当前形态与入口以 [ADR-0016](../../../docs/adr/ADR-0016-separate-client-admin-surfaces.md) 为准：用户 main.tsx 与管理员 admin.tsx 独立入口，管理页只在 admin-app.tsx 装配，共享 Workspace/表单/消息/主题。单机/桌面仅业务和本地外观，不提供站点、品牌、SMTP、对象存储和后台。管理员公开 auth/bootstrap 只返回固定域最小投影；本人 account 需管理员会话，其余管理资源须 permissions/superAdmin，不能宽泛豁免 admin 路由。新增普通用户立即 active 并验证用户入口登录；注册默认关闭，安全页 Switch 控制且须 SMTP 测试。布尔控件用 Switch，上传用自定义拖拽弹窗与 SDK 真实阶段。

分片与断点续传按 [ADR-0022](../../../docs/adr/ADR-0022-resumable-uploads.md)：复用 blob.Multipart / PartReceiver、files.UploadSession 与 FileUploadDialog/SDK。先登记持久清理再 begin；对精确 staging/复制目标键清理所有未完成 upload，覆盖丢失 upload ID，不扫描无关前缀。服务端列举实际分片并核验序号/大小/ETag；本地流式合并核对 SHA-256，云端保持直传、条件复制及大对象分片复制。续传重选原文件并核对完整内容，暂停不删除、放弃走删除，确认提交复核未取消；旧凭证不能写正式键。管理员统一策略对新会话生效，普通用户只读 policy 安全投影。新增提供商必须实现/验证 multipart 权限、CORS PUT、重启续传与持久 abort 重试；真实厂商范围见 acceptance-multipart.md，不沿用过期的“未验证”声明。
