<!-- Author: yunnuo <ymz@ebox.vip> -->
# 文件存储验收（2026-10-27）

## 范围与文件

web-platform：blob port、bloblocal/blobcloud、files/filesql、0009 三方言、平台 HTTP/SDK、存储设置和文件管理。web-standalone/desktop：品牌改为注入本地 blob adapter，原目录兼容；CLI 不装配。关键文件 internal/blob/store.go、internal/files/service.go、internal/files/branding.go、internal/adapter/storage/filesql/repository.go、internal/adapter/http/storage.go、packages/web-ui/src/storage-page.tsx / files-page.tsx。契约、权限、迁移 level 9、发布/部署手册、manifest 和 add-file-storage Skill 同步；详见 ADR-0015。

## 验证证据

最终 make docs / make test 通过（含 go vet、go test -race、33 项前端单测、类型/权限/契约/设计/作者/依赖检查）；Web、CLI 与 macOS arm64 Wails 构建通过。完整 PC/手机页面回归 36 项通过，4 项未注入数据库环境的既有安装页用例跳过；本轮另以独立三方言数据库实测文件迁移与生命周期，数据库保留、不复用既有库。

- 本地：原子写入、大小不符不替换原文件、路径/符号链接隔离、取消、ETag 复制；签名失效、身份域/跨用户拒绝、上传完成幂等、完成后禁止重写、失败确认和真实重启恢复、未完成上传到期清理。
- MinIO 开发环境：专属随机前缀实际 Put/Open/条件 Copy/Delete、POST 精确长度策略、私有桶未签名 GET 拒绝、签名附件下载；重放 staging 凭证不覆盖 ready、切换默认后旧文件可读、迁移保持 file_id 并校验 SHA-256。测试对象在各自前缀内清理；未修改公共读。
- SQLite/MySQL/PostgreSQL：从旧迁移升级，0009 重复执行及模拟版本记录中断后的重试，文件元数据事务、查询、状态和清理；使用本轮唯一隔离 DB，不删除此前测试库。其他 profile 不运行平台迁移。
- 页面：PC/375px，浅/深主题、本地策略、配置弹窗焦点/Escape、用户与管理员权限、重启、上传/签名下载/迁移，以及云端品牌。手机文件列表采用卡片布局，无需横向滚动操作。截图 build/acceptance/storage，浏览器测试 storage.spec.ts；真实 8 MiB 文件确认直传 MinIO、未代理经过应用。云测试关闭持久 trace，凭据通过环境注入。
- 原生：macOS arm64 Wails 构建及图标检查通过；真实窗口保存品牌、退出后重启确认保留、恢复默认成功，截图 build/acceptance/storage/native。没有文件/对象存储入口和用户头像。CLI 与桌面依赖边界检查不引入平台或云 SDK。
- SDK：云请求 credentials=omit 且不携带平台 CSRF/身份头，上传失败不确认；OSS/COS 官方 SDK 签名绑定 Content-Length/Content-Type 的离线检查通过。没有对应真实账号，OSS/COS/Amazon S3 不声明云端实测。

当前边界：单文件最多 1 GiB，尚无分片断点续传；批量自动迁移、跨区域灾备、存储配额/计费不在本轮。MinIO 服务级 CORS 可检测，服务未允许站点时需运维设置；对象桶生命周期规则由运维维护，应用负责登记对象的持久清理。云 URL 在有效期内仍为 bearer。回退需恢复匹配 DB/data/key/binary 与独立对象备份。
