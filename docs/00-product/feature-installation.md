<!-- Author: yunnuo <ymz@ebox.vip> -->
# 首次安装与持久化约定

适用 web-platform/web-standalone；desktop 自动使用本地 SQLite，无安装页，CLI 不装配安装/数据库。

| 需求 | 当前行为与验收 |
| --- | --- |
| 在线数据库选择 | 默认 MySQL，PostgreSQL 同为推荐；SQLite 需显式选择，面向本机或小型测试 |
| 分开填写连接信息 | MySQL 默认 127.0.0.1 / 3306 / unicore / root；PostgreSQL 默认 127.0.0.1 / 5432 / unicore / postgres；密码无默认值 |
| 每种数据库可测试 | 验证凭据、实际 Ping、检查目标范围、表/视图数量和已完成安装标记；连接或凭据改变后必须重新测试 |
| 初始化已有数据 | 先提示不可逆清空和备份；非空库必须勾选确认并准确输入数据库名，后端独立校验；正常运行的已安装实例拒绝重新安装；停服删锁后仅可确认清空本站原库，其他实例或归属不明非空库拒绝覆盖 |
| 安装凭据生成 | 首次启动生成私有 bootstrap.token；凭据只保存在数据目录文件中，页面不提供重置；需要更换时停服删除该文件并重启即重新生成；不匿名发放 |
| 服务地址 | 页面不要求填写，自动保存当前浏览器 origin；邮件链接默认使用此值，可在基础设置覆盖；OIDC callback 和 Secure Cookie 仍使用安装值 |
| 重启恢复 | 保存加密数据库配置、安装形态、实例 ID 和原密钥；DB 安装标记、默认设置和管理员同事务提交；连续重启保持原账号/设置 |

数据库须提前创建并属于当前实例。MySQL 初始化当前库中的表/视图，PostgreSQL 限独占 public schema 并拒绝其他用户 schema，SQLite 固定为私有目录 unicore.db。系统/维护数据库不可作为安装目标。连接测试不清空、不迁移；SQLite 测试会创建空文件。新表只由完成安装创建。

TLS 是显式开关且默认关闭，覆盖本机与内网直连；开启后 MySQL 使用 skip-verify、PostgreSQL 使用 sslmode=require，仅加密传输不校验证书，自签名内网证书可直接使用。需要严格证书校验的目标库通过旧版 dsn 兼容通道配置 sslmode。MySQL 用驱动配置、PostgreSQL 用 URL 编码处理特殊字符密码。旧 API 的 dsn 保留兼容，不能与结构化字段混传；页面不暴露 DSN。

bootstrap.token 是首次配置的所有权证明；secret.key/APP_SECRET_KEY 才是 AES-GCM 加密密钥。安装 API 在安装后返回 409，生成 0600 install.lock，bootstrap.token 删除且哈希吊销；按钮与状态接口不泄露凭据给匿名访问者。页面只在内存保留输入，不写浏览器持久存储或日志。

安装中断时，未拥有 schema 的实例需再次明确确认才能清空；MySQL DDL 可能部分完成，不能承诺事务回滚。拥有的部分 schema 按原配置重试迁移；已提交 DB 标记则恢复完成。INSTALLED 后 DB 不可达、安装表/标记缺失或实例不匹配均停止启动，不自动回到安装页，不重建管理员。

历史安装配置仍可读取；已安装且尚无 lock_version 的旧实例先验证原 DB 再补锁，不自动开放重装。新增 lock_version/reinstall 私有字段，不对外返回。更新只替换程序，保留完整私有目录与数据库；错误的数据删除只能通过成套备份恢复。操作见 [部署手册](../03-runbooks/deployment.md)，决策见 [ADR-0013](../adr/ADR-0013-installation-experience.md)。安装、重启与异常状态在隔离实例逐项验证，不以历史结果代替当前测试。

Linux Web 发行包提供 unicore/unicorehelp：help 显示菜单，config generate（兼容 generate-config）创建拒绝覆盖的私有启动 JSON，--config / APP_CONFIG 显式读取；无参数保持启动服务。此配置只管理运行参数，数据库与管理员仍由安装页引导，不增加命令行管理员密码操作。macOS 桌面通过 DMG 拖入 Applications，Windows 桌面直接运行 EXE；用户下载格式与供 OTA 使用的 tar 归档分别保留。

## 管理员明确重装

服务器管理员先停服、成套备份，再仅删除私有数据目录中的 install.lock 并重启。运行中删除不会改变安装状态。不能删除 installation.json、secret.key 或 instance.lock：它们分别保存原库归属、密钥与进程互斥用途。首次升级自动补锁，随后删锁才表示明确重装意图；损坏/错配/符号链接锁文件拒绝启动。

重开向导时保留原库的加密连接配置、profile 和实例 ID 作为私有归属凭据，生成全新的 bootstrap.token，旧文件/环境注入凭据都不能授权本轮重装。匿名状态接口不返回目标、密钥或 token。原库离线时仍可选新空库，不要求先删除旧数据。

连接测试只读检查。空库可安装；与原连接及原实例/profile 标记完全一致的本站数据库，必须重新勾选清空并准确输入库名，完成请求再次独立检查后才清空。别站标记、丢失/损坏标记或归属不明的非空库拒绝，不能通过勾选或直接 API 绕过。重装属于从头初始化，会删除目标库全部表/视图及账号、配置和业务数据，不提供保留数据的重复 Seed；保留数据应走升级/备份恢复。

重装 intent 在失败/重启后保留；不把旧 DB 的安装标记恢复成一次新安装成功。MySQL 清空中断且已丢失归属标记时停止，另用空目标或成套恢复备份，不自动继续清空。完成后生成新实例标记和 install.lock、吊销新 token。文件存储目录不由安装程序删除；数据库被替换后未引用的历史文件须由服务器管理员单独维护。决策见 [ADR-0028](../adr/ADR-0028-explicit-installation-unlock.md)。

框架物理表统一使用固定 unicore_ 前缀，例如 unicore_users、unicore_install_state；派生项目名/slug 不改变它。本站归属以实例 ID 和持久配置判断，不以表名前缀或站点名称判断。

安装向导使用响应式宽卡片与清晰步骤条：桌面各步骤并列，小屏逐项排列；完成页的用户入口、后台/设置入口均为可点击链接，并保留进入工作空间按钮。
