<!-- Author: yunnuo <ymz@ebox.vip> -->
# 运行、安装与恢复边界

当前为开发预览，已有安装、身份、持久数据、邮件账号、OIDC 与离线加密备份恢复。真实授权仍为占位；签名 OTA 与可选系统签名流程见 [更新手册](updates.md)，直接分发不要求 OS 开发者凭据；生产部署需对应验收。

## Web

`make install` 后运行 `make dev-server` 与 `make dev-web`，访问 5173；或 `make build-web` 后运行 build/bin/server，访问 3000。默认监听 loopback。首次请求进入 /install，从私有数据目录的 bootstrap.token 读取一次性凭据，源码构建默认选择 Web 平台，发行包与显式部署 profile 沿用各自默认值；可选择单机，平台必须填写管理员，单机不出现账号步骤。

| 环境变量 / flag | 用途 |
| --- | --- |
| APP_DATA_DIR / --data-dir | 私有目录，默认 data/，不放公开 Web root |
| APP_LISTEN / --listen | 默认 127.0.0.1:3000；远程必须有受控反代/ACL |
| APP_PROFILE / --profile | 首装默认模式；已安装实例不允许与持久 profile 冲突 |
| APP_BOOTSTRAP_TOKEN | 部署时注入 32～256 字符；不注入则生成受限文件，成功后逻辑吊销 |
| APP_SECRET_KEY | 32 字节的标准 base64 外部密钥；不注入则生成 0600 secret.key |
| APP_ADMIN_PATH | 后台路径恢复覆盖，规则与设置一致，例如 /manage |
| APP_DEPLOYMENT_KIND | development / tar / docker，仅表示交付介质 |
| APP_LOG_FILE | true 时双写 APP_DATA_DIR/logs；桌面默认开启，其余见运行基座 |
| APP_LOG_MAX_AGE_DAYS / _MAX_SIZE_MB / _MAX_TOTAL_MB | 轮转日志保留天数（0=永久）/单文件阈值/总量上限；平台可在设置页运行时调整保留天数 |

数据目录包括 installation.json（DSN 密文与安装 intent）、secret.key（若未外置）、bootstrap.token（仅安装前）、instance.lock、安装完成生成的 install.lock、SQLite 时 unicore.db/WAL、开启文件日志时的 logs/。不得删除安装状态来重新部署；缺少配置但存在 DB 时拒绝覆盖。profile 更换应新部署+独立迁移。其他已安装实例的 DB 始终拒绝接管；未安装非空库只有明确勾选清空并精确输入目标库名后才能初始化。

两个 Web 安装页默认 MySQL，PostgreSQL 同为在线推荐；SQLite 需显式选择。MySQL 分开填写地址（默认 127.0.0.1）、端口（3306）、数据库名（unicore）、用户名（root）、密码；PostgreSQL 默认端口 5432、用户名 postgres。先由运维创建当前实例独占数据库并授予表/索引/约束和必要清空权限，框架不创建数据库本身。Docker 里的 127.0.0.1 指当前容器；同网络数据库填服务名，宿主机数据库按 Docker 网络配置填写可达地址。

三种数据库都必须点击“测试连接”成功才能继续，任何连接字段改变使结果失效。测试只连接和检查已有对象/安装标记，不清空、不迁移。空库直接创建；非空专用库显示数量和不可逆警告，必须先备份，再勾选并输入完全一致的库名。MySQL 清空选定库的表和视图，PG 限独占 public schema 并拒绝其他用户 schema，SQLite 固定私有 unicore.db。正常安装不能清空已有实例标记；管理员重开向导后的本站原库例外见下方。MySQL 清空可部分完成，修正权限后重新测试、确认；不能靠重启自动继续删除。

结构化字段经驱动安全构造 DSN，密码特殊字符无需自行转义；旧 API dsn 仅兼容保留。持久配置是 AES-GCM 密文，错误不回传连接串。TLS 提供关闭、仅加密、校验证书与主机名三种模式；远程数据库推荐第三种，结构化 tls_verify=true 生成 MySQL tls=true / PostgreSQL verify-full。私有 CA 与备份工具的配置见 [数据库连接配置](../product/configuration.md#数据库-tls-与证书)。详细规则见 [安装规范](../00-product/feature-installation.md)。

## 管理员重装

完成安装后 /install 重定向且安装写 API 返回 409。需要从头安装时：停服 → 使用匹配版本工具成套备份数据库、数据目录和密钥 → 仅删除 APP_DATA_DIR/install.lock → 重启 → 从新 bootstrap.token 读取凭据。重装状态忽略旧 APP_BOOTSTRAP_TOKEN；不要删除 installation.json 或 secret.key。第一次升级到支持锁文件的版本会自动补锁，保持原站运行。

同一原数据库必须使用原连接参数，并通过实例/profile 标记匹配；勾选清空并准确输入库名后才能重新初始化，原账号/设置/业务数据全部删除。新空库可以安装，原库不变。其他实例或无法证明归属的非空库禁止覆盖，改用专用空库或恢复原配置。运行中删锁不生效；锁损坏不自动开放安装。完成后重新生成锁并吊销凭据。MySQL 清空中断且原标记已丢失时停止，不替管理员继续清空。

框架表使用固定 unicore_ 前缀，项目生成时保持；自有业务表可自行命名。当前 0.x 运行时的迁移 0013 保留数据重命名旧表，升级前备份并停服；名称冲突拒绝，不自动删表。回退恢复升级前快照和匹配旧程序。

## 密钥与安装故障

bootstrap.token 用于证明服务器所有权、防止别人抢先建管理员，与加密密钥独立。首次启动已自动生成；页面不提供重置，需要更换时停服删除数据目录中的 bootstrap.token 并重启即重新生成，或在未安装状态停服务后通过 APP_BOOTSTRAP_TOKEN 注入新值，启动读取后移除环境覆盖；再次带固定环境覆盖启动会恢复该注入值。不要匿名发放或把 token 当作 APP_SECRET_KEY。

保持 DB、installation.json 和加密密钥成套备份；若 APP_SECRET_KEY 外置，另行受控保存。密钥丢失无法解密配置，应恢复原密钥，不能通过新生成密钥解密旧数据。不得把 key 放入镜像或 Git。

安装中断后带原 token 重试。重启会验证 DB 实例标记：已提交则恢复完成并吊销 token，未提交且属于本实例的部分 schema 可重试。外部数据库不可达/迁移权限不足时修正连接后重试。DB 已成功提交但配置收尾失败时，释放磁盘空间并重启，不再建管理员。已 INSTALLED 时 DB 不可达、安装表/标记缺失、实例归属不符会拒绝启动，不会自动重装；恢复同一时间点的 DB、配置和密钥后重启。

登录/注册默认图形验证码，注册关闭；无 SMTP 时保留至少一个可用本地管理员。后台路径误配可以通过 APP_ADMIN_PATH 恢复；环境覆盖不改变 API 的权限检查。

## Desktop / CLI

`make dev-desktop` 使用 go.mod 锁定的 Wails（当前 v2.13.0），CLI 工具应安装匹配版本；默认系统 AppData/Unicore/desktop 自动 SQLite，APP_DATA_DIR 可隔离测试。没有安装/登录，用户表不会创建；进程锁防止同时使用同一目录。绑定生成不读写真实数据。桌面日志自动写入数据目录 logs/ 并保留 stderr 输出，保留策略用 APP_LOG_MAX_AGE_DAYS 等环境变量控制（重启生效）。macOS 需 Xcode tools，Linux Ubuntu22.04 需 WebKitGTK4.0，4.1 环境追加 webkit2_41；Windows 需 WebView2。

CLI 直接运行 `build/bin/unicore execute --text "Hello Unicore"`，不打开 HTTP/Wails/DB。仅业务文本分析无持久化，输入不会写日志。

## Web 发行部署

Web 程序内置 `manage` 交互菜单与 Linux/systemd 的 `service install`、`start`、`stop`、`restart`、`logs`。离线恢复命令、服务配置发现和外部密钥文件约束见 [Web 管理命令](../product/configuration.md#web-管理命令)；安装受管服务的完整步骤见 [内置服务管理](../product/deployment.md#使用内置服务管理推荐简化部署)。独立业务 CLI 不装配这些能力。

完整的用户操作步骤统一维护在 [Web 从零部署指南](../product/deployment.md)：先说明系统/资源/架构/端口和数据库，再提供 Docker 命令、独立 Compose（含 PostgreSQL）、tar 下载校验与完整 unicore.service、Nginx/宝塔 HTTPS、安装向导、重启检查、更新与故障排查。新部署从该页开始，不需要先读开发阶段记录。

启动 flags、APP_* 环境、JSON 字段、systemd/容器优先级和后台配置表统一维护在 [配置说明](../product/configuration.md)。本文保留安装归属、重装、密钥及历史兼容边界，不再重复另一套部署步骤。

## 检查与备份边界

live 是进程存活；ready 要求已安装并 DB Ping 成功。测试通过独立临时目录/DB，不能使用生产数据库。提供 PostgreSQL/MySQL 测试 DSN 后 make test 会真实建表，仅用于空测试库。

Web 发行包通过 `unicore backup|verify|restore` 离线加密备份/校验/恢复；源码与桌面运维可构建独立 `unicore-ops`。先停止全部实例/worker 或退出桌面，成套保存 DB、私有文件、配置、原密钥及云文件；恢复到新的目录和空专用库，详见 [备份恢复](backup.md)。在线备份、定时调度和 PITR 尚未实现，不承诺不可逆 DDL 后只回滚二进制可恢复数据。

## SMTP、注册与密码恢复

只有平台管理端提供邮件设置。进入「系统管理 → 邮件设置」，先保存主机/端口/加密方式/发件人及可选登录凭据，再点击同一页面的「发送测试」，在弹窗填写收件邮箱，等待真实测试成功。在本页「账号流程」可开启“邮件找回密码”/“邮箱验证码登录”；开放注册默认关闭，在「系统管理 → 系统设置 → 基础设置 → 注册设置」开启；“注册邮箱验证”独立控制，仅开启该选项时需要已测试 SMTP，关闭时注册立即生效。布尔项使用开关，邮件配置与测试不拆成嵌套标签；邮件主题/内容可在「系统管理 → 邮件模板」独立配置，支持变量、预览、测试发送与恢复默认，详见 [管理工具](admin-tools.md)。邮件策略不进入单机或桌面。密钥输入留空保留，清除按钮只在保存时清空；读取不会返回原值。更改 SMTP 前先关闭邮箱验证、邮箱登录与找回密码三项邮件流程，改完重测再开启。

推荐 STARTTLS 587 或 TLS 465；证书由系统根证书验证，不提供跳过验证选项。plain 仅供 loopback SMTP sink/本机 relay，不能用于远程明文凭据传输。测试通过表示 SMTP 已接受邮件，不保证收件箱投递。监控 SMTP 服务商告警、退信与配额；M2c 已使用经用户授权的 QQ SMTP 做四种模板真实投递，收件人确认显示正常；个人凭据不进入仓库。

账号邮件使用持久队列，由 server 进程运行。「系统管理 → 操作日志 → 邮件投递」展示最近 30 项的状态/尝试次数，失败自动重试最多 5 次，终止后由用户在登录页重新申请，避免把已过期验证码重新投入队列。错误仅显示 DELIVERY_FAILED/EXPIRED，不保留原始 SMTP 响应或凭据。进程重启可恢复过期租约，可能重复投递，邮件令牌仍只能使用一次。完成/终止/取消清空载荷，终态元数据在后台清理时保留最多 7 天。

数据库初始化与后续迁移由 Catalog 单轨执行；当前基线已含账号、通知与邮件所需表。正式版后升级只追加命名空间版本，停服并保存完整快照，正常启动应用缺失尾部；失败不得删账本或重走安装。

验证链接有效 30 分钟、重置链接 15 分钟。重发使旧链接失效，密码重置使所有设备会话失效。用户状态/角色被管理员改变也会撤销待用令牌。邮箱验证不会自动登录或授予管理权限。管理员通过受保护的用户管理手动启用待验证用户属于显式管理操作。

M2c 新表单使用 6 位数字，10 分钟有效，60 秒后重新申请，连续错误最多 5 次；未知/不适用账号申请保持统一提示。页面状态刷新后需重新申请验证码；冷却期间继续使用原页面的码，等待后再申请。旧验证/重置链接继续兼容原有效期，新 UI 不再发送链接。错误 TOKEN_INVALID 同时表示不存在/过期/已使用/次数用尽，不泄露具体账户状态。

主题修改与全套原生图标重建见 [设计系统](../02-standards/design-system.md)。macOS 请启动 build/desktop/bin/Unicore.app 应用包；系统关于、bundle 和窗口资源都来自同一品牌输入。

完整配置优先级、日志与监控端口见 [运行基座](../02-standards/runtime.md)。API 文档默认关闭，开发/受控环境可设 APP_API_DOCS=true；独立指标设 APP_MONITOR_LISTEN=127.0.0.1:9090，不映射公网。

Web 收到 SIGINT/SIGTERM 后停止接收新请求，等待在途请求默认最多 5 秒（APP_SHUTDOWN_TIMEOUT 可配置），再等待 worker 结束并关闭数据库；到期关闭连接并以错误退出。处理器须响应请求 context。基础能力的适用范围与限制见 [支持范围](../support.md)。

桌面生产/开发 bundle ID 分别为 vip.ebox.unicore 和 vip.ebox.unicore.dev，不再使用框架默认标识；本地数据目录不因该标识改变。旧目录中复制出的应用包需要重新构建/替换才能更新图标；本次只验证仓库生成的包，不自动删除系统内其他副本或清理全局图标缓存。

## M3a OIDC 接入与恢复

仅平台启用。先确认安装登记的 BaseURL 为对外 HTTPS origin，再在企业 IdP 创建 OIDC 应用，登记「系统管理 → 系统设置 → 基础设置 → 企业登录」中服务检查显示的精确 callback（包括 scheme/host/port/path）。用户与管理员回调分别为 `/api/v1/auth/oidc/callback`、`/api/v1/admin/auth/oidc/callback`，需要的地址均须登记到 IdP 白名单。默认使用 openid email profile；授权码、PKCE S256、签名 ID token 是必需条件。若使用机密客户端，支持 client_secret_basic/client_secret_post；public client 可不填密钥。绑定要求 IdP 支持 prompt=login/max_age=0 并返回新鲜 auth_time。

在同一「企业登录」标签保存 Issuer、Client ID、可选密钥，检查发现连接；通过只代表发现文档和端点可用，仍需用测试账号完成实际登录。确认后开启企业登录，按需要开启「首次登录创建普通账号」。JIT 用户必须有已验证邮箱，不存在于本地，且固定 user 权限；企业管理角色不导入，不开放管理员自注册。同邮箱已有本地用户应先在对应身份域密码登录，经账号菜单打开「个人中心 → 安全设置」，确认本地密码后绑定；不要通过修改邮箱绕过归属证明。

仅本机隔离测试允许 literal loopback IP 的 HTTP，例如 127.0.0.1；不能用远程 HTTP、跳过证书验证或跨端点重定向。新装应直接从实际 HTTPS 域名进入 /install，页面自动登记该 origin；已有开发实例若登记了错误 BaseURL，停服务并成套备份后仅修正 installation.json 的 base_url，再启动核对 callback，不能更改 profile/instance/DSN/密钥字段。生产反代需使用固定受信任的 host，身份服务必须可被后端访问。

每浏览器完成最新一次授权；过期/重放/校验失败请从登录按钮重新发起，旧地址不可重用。SSO-only 账号可重新验证已绑定企业身份后设置本地 TOTP，无需 SMTP；它仍不能直接解绑，解绑前请由管理员按现有 SMTP 流程开放找回密码，完成邮箱验证设置本地密码。绑定或解除后其他设备退出，待用验证码失效。账号禁用及本地角色改变依然撤销会话。外部 IdP 停用不会主动吊销已有本地 session，按需要缩短会话或本地禁用账号。

始终保留一个已验证能密码登录的本地超管。IdP 故障时使用登录页的本地账号入口，关闭 oidc.enabled 或修复配置；不删除绑定表。Client Secret 轮换先在 IdP 配置，再在本地保存新值，旧授权会因配置指纹变化失败，需要重新发起。修改 OIDC 配置不撤销已建立 session，如需立即撤销，应禁用对应本地账号。

当前统一账号的 OIDC 表包含在 platform@1 基线中，单机/桌面不装配 OIDC。开发期旧分表库不提供原地升级；恢复使用匹配程序与完整快照。

本机验收使用 tests/oidcprovider，只编入测试工具，不进入发布物。`make build-web && pnpm test:e2e` 自动构建该隔离服务，不需要真实企业凭据或外部邮件。

## M3b 品牌图片与恢复

管理端「系统管理 → 系统设置 → 基础设置 → 品牌图片」分别选择 PNG/JPEG（站点图标也可选 ICO），检查预览后保存；深色 Logo 可单独覆盖，站点图标影响标签/触屏链接和 manifest。每项“恢复默认”需确认，恢复到编译品牌。普通设置编辑不能写 branding.* 引用。更换主题主色/原生图标仍需修改代码设计源并构建；单机/桌面仅使用构建品牌，没有运行时品牌管理页。

brand-assets/ 位于 APP_DATA_DIR（桌面为其配置目录）内，目录 0700、图片 0600。tar 部署不要覆盖数据目录；Docker 必须将整个数据目录持久挂载到镜像外，包含已有配置/密钥和新图片目录，不单独挂载只读图片。迁机或手工备份先停止实例，成套保存同一时间点 DB、installation.json、原密钥和 brand-assets。外部 DB 同样需要配套目录；不要只复制 SQL 引用。当前离线加密备份恢复使用 unicore-ops，见 [备份手册](backup.md)。

图片缺失会在界面回退默认；先检查目录挂载、文件权限及历史存储位置，恢复同一快照的图片，或由管理员恢复默认再上传。不要手工塞原始图片或外部路径进 system_settings。当前品牌已接统一存储接口与文件元数据，新图片写入当前默认位置，旧 brand-assets 文件通过 legacy-brand 位置读取，不因切换默认位置自动迁移。公开品牌仍通过应用的当前引用路由提供，私有桶不需公开；未接 CDN。未引用文件由存储清理策略处理，已缓存旧图可短暂保留，队列邮件使用创建时图片。


## 设置与可裁剪授权/系统更新

平台备案号/HTTPS 查询链接在「系统管理 → 系统设置 → 基础设置 → 基础信息」保存，登录页与工作台共用；编号留空隐藏。SMTP 别名在「邮件设置」填写，留空跟随站点名，用于测试/账号/系统通知显示名；密钥仍只显示配置状态。业务通知调用与限制见 [设置规范](../00-product/feature-settings.md)。

默认 FEATURE_LICENSE=false、FEATURE_UPDATER=true。平台管理员可使用系统更新，授权检测仍可选占位；单机/桌面仅提供系统更新。前后端必须使用同一组编译输入：

```sh
make build-web FEATURE_LICENSE=true FEATURE_UPDATER=true
make build-desktop FEATURE_LICENSE=true FEATURE_UPDATER=true
make release FEATURE_LICENSE=true FEATURE_UPDATER=false
```

两项均可独立 true/false，非法值使构建失败。make dev-server/dev-web/dev-desktop 使用相同变量；直接 pnpm/Vite 构建需传入对应 FEATURE_* 环境变量，直接 go build 需对应 -tags license,updater。生产进程启动后修改 FEATURE_* 不会重新引入被裁剪代码。Docker 构建参数为 --build-arg FEATURE_LICENSE=true / --build-arg FEATURE_UPDATER=true，两阶段使用同一输入；推荐 make docker-build FEATURE_LICENSE=true。镜像实际验收范围见部署验收。

前端产物 features.json 记录编译能力；后端 bootstrap.capabilities 返回实际装配能力，CLI 始终 false。页面同时检查两端能力，任一端关闭都不显示；普通用户不能读取平台版本/更新能力。打开更新页先读本机历史，仅主动检查才联网；手动安装必须通过发行签名与兼容性校验。授权开启后仍显示待对接卡片。测试构建和 E2E 同样传入相同变量，部署和恢复要求见 [更新手册](updates.md)。

## 对象存储与恢复

在线平台启动新增存储位置、文件元数据和持久清理表；保留旧品牌目录，旧引用惰性登记，不自动挪动已有文件。默认本地，管理员测试后才激活云位置；配置、签名访问、跨域、Nginx 上传限制、迁移/清理和恢复边界见 [存储手册](storage.md)。tar/Docker 都把元数据 DB、私有数据目录和实例密钥独立持久化，切换容器或二进制不能丢弃这些数据；云桶需独立备份。

当前双入口、单机边界和升级兼容说明见 [ADR-0016](../adr/ADR-0016-separate-client-admin-surfaces.md)。

当前已有 [私有对象存储](storage.md) 和 [离线加密备份恢复](backup.md)；旧阶段中“后续备份/对象存储”的描述仅代表当时边界。业务模块迁移登记 module.<slug>，与框架共用四列 schema_migrations 账本；不另建 business_migrations。

系统更新以 [ADR-0018](../adr/ADR-0018-signed-updates.md) 取代升级占位：FEATURE_UPDATER 默认 true，FEATURE_LICENSE 默认 false。平台仅管理员，单机/桌面可看内置离线日志，Docker 不执行应用内安装。Tar 默认 systemd 模板未开放安装目录写权限，启用 OTA 前必须按 [更新手册](updates.md) 配置安装根、supervisor 与目录权限。
