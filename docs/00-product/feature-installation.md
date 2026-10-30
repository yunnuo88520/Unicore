<!-- Author: yunnuo <ymz@ebox.vip> -->
# 首次安装与持久化约定

适用 web-platform/web-standalone；desktop 自动使用本地 SQLite，无安装页，CLI 不装配安装/数据库。

| 需求 | 当前行为与验收 |
| --- | --- |
| 在线数据库选择 | 默认 MySQL，PostgreSQL 同为推荐；SQLite 需显式选择，面向本机或小型测试 |
| 分开填写连接信息 | MySQL 默认 127.0.0.1 / 3306 / unicore / root；PostgreSQL 默认 127.0.0.1 / 5432 / unicore / postgres；密码无默认值 |
| 每种数据库可测试 | 验证凭据、实际 Ping、检查目标范围、表/视图数量和已完成安装标记；连接或凭据改变后必须重新测试 |
| 初始化已有数据 | 先提示不可逆清空和备份；非空库必须勾选确认并准确输入数据库名，后端独立校验；已完成的 Unicore 数据库始终拒绝重新安装 |
| 安装凭据生成 | 首次启动生成私有 bootstrap.token；页面持有当前有效凭据时可生成新凭据，旧值立即失效；不匿名发放 |
| 服务地址 | 页面不要求填写，自动保存当前浏览器 origin；邮件链接、OIDC callback 和 Secure Cookie 仍使用此值 |
| 重启恢复 | 保存加密数据库配置、安装形态、实例 ID 和原密钥；DB 安装标记、默认设置和管理员同事务提交；连续重启保持原账号/设置 |

数据库须提前创建并属于当前实例。MySQL 初始化当前库中的表/视图，PostgreSQL 限独占 public schema 并拒绝其他用户 schema，SQLite 固定为私有目录 unicore.db。系统/维护数据库不可作为安装目标。连接测试不清空、不迁移；SQLite 测试会创建空文件。新表只由完成安装创建。

TLS 自动模式在 literal loopback/localhost 使用直连，远程必须验证证书；提供显式关闭项供受控内网，不能跳过证书验证。MySQL 用驱动配置、PostgreSQL 用 URL 编码处理特殊字符密码。旧 API 的 dsn 保留兼容，不能与结构化字段混传；页面不暴露 DSN。

bootstrap.token 是首次配置的所有权证明；secret.key/APP_SECRET_KEY 才是 AES-GCM 加密密钥。安装 API 在安装后返回 409，bootstrap.token 删除且哈希吊销；按钮与状态接口不泄露凭据给匿名访问者。页面只在内存保留输入，不写浏览器持久存储或日志。

安装中断时，未拥有 schema 的实例需再次明确确认才能清空；MySQL DDL 可能部分完成，不能承诺事务回滚。拥有的部分 schema 按原配置重试迁移；已提交 DB 标记则恢复完成。INSTALLED 后 DB 不可达、安装表/标记缺失或实例不匹配均停止启动，不自动回到安装页，不重建管理员。

无新增表或配置格式迁移，历史安装配置仍可读取。更新只替换程序，保留完整私有目录与数据库；错误的数据删除只能通过成套备份恢复。操作见 [部署手册](../03-runbooks/deployment.md)，决策见 [ADR-0013](../adr/ADR-0013-installation-experience.md)。安装、重启与异常状态在隔离实例逐项验证，不以历史结果代替当前测试。
