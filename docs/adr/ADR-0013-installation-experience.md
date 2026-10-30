<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0013：结构化安装配置与明确初始化

状态：接受 · 日期：2026-10-27 · 作者：yunnuo / ymz@ebox.vip

在线用户不应拼接 DSN 或误用默认 SQLite；安装凭据和加密密钥的用途需明确，安装完成必须在程序/容器替换后保持。本决策更新 ADR-0003 的“仅空库”和“API 不返回 token”部分，其余锁、加密、实例标记和 profile 隔离保持。

两个 Web profile 默认推荐 MySQL，PostgreSQL 同为推荐，SQLite 显式选择。DatabaseInput 保留旧 dsn，新增 host/port/name/username/password/tls，禁止混传。驱动安全构造连接串，加密保存原格式，避免人为转义密码。桌面与 CLI 不引入新的驱动或安装能力。

verify-db 在 bootstrap 授权后真实连接并返回表/视图数、目标名和已有安装标记，不执行迁移/清空。非空专用库允许初始化，但必须有 reset_database=true 和精确 database_confirmation，服务端重新检查；已有 Unicore 标记始终拒绝。系统库拒绝，PG 限 public 且拒绝其他用户 schema，MySQL 清表/视图并恢复 FK 检查。只在用户授权的完成安装边界执行 Reset。

清空成功才持久化 owns_schema；清空中断保持未拥有，重启不会替用户继续删除。MySQL DDL 无整体事务，重试要求再次确认；PG 清空在事务内完成。安装标记和 seed 仍同事务。已安装实例缺失 DB/标记时在任何迁移之前拒绝，避免自动重建。没有 schema 变更，不新增空迁移或修改旧 checksum。

初始 bootstrap.token 由服务器自动生成，或显式环境注入。页面的“生成新凭据”先验证当前凭据，再原子保存新文件和哈希，响应仅返回新凭据；无当前凭据不能生成。它证明服务器所有权，不能充当加密密钥。安装后吊销且不再签发；状态接口无 secret，输入不进入浏览器持久存储。

服务访问地址从当前 origin 自动取值并按既有规则校验后持久化，移除手填。邮件、OIDC、Secure Cookie 需要稳定 origin，所以保留内部 base_url。安装必须从实际 HTTPS 域名访问，域名改变时按部署手册停服修改；不能每次请求根据任意 Host 重写已安装地址。

兼容与恢复：历史 DSN 配置直接读取；保留数据库、installation.json 和原密钥成套恢复，不允许删配置以重新安装。无法事务恢复的目标库清空必须靠安装前备份；当前没有自动备份恢复工具。三方言与浏览器重启按 [部署手册](../03-runbooks/deployment.md) 分别验证；后续离线备份工具见 [ADR-0017](ADR-0017-developer-kit-business-backup.md)。
