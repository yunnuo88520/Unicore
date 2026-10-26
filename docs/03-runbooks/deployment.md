<!-- Author: yunnuo <ymz@ebox.vip> -->
# M3a 运行、安装与恢复边界

M3a 是开发预览，已有安装、身份、持久数据、邮件账号与 OIDC 流程。备份工具/授权/升级尚未实现，正式上线仍需后续验收。

## Web

`make install` 后运行 `make dev-server` 与 `make dev-web`，访问 5173；或 `make build-web` 后运行 build/bin/server，访问 8080。默认监听 loopback。首次请求进入 /install，从私有数据目录的 bootstrap.token 读取一次性凭据，选择 Web 平台/单机；平台必须填写管理员，单机不出现账号步骤。

| 环境变量 / flag | 用途 |
| --- | --- |
| APP_DATA_DIR / --data-dir | 私有目录，默认 data/，不放公开 Web root |
| APP_LISTEN / --listen | 默认 127.0.0.1:8080；远程必须有受控反代/ACL |
| APP_PROFILE / --profile | 首装默认模式；已安装实例不允许与持久 profile 冲突 |
| APP_BOOTSTRAP_TOKEN | 部署时注入 32～256 字符；不注入则生成受限文件，成功后逻辑吊销 |
| APP_SECRET_KEY | 32 字节的标准 base64 外部密钥；不注入则生成 0600 secret.key |
| APP_ADMIN_PATH | 后台路径恢复覆盖，规则与设置一致，例如 /manage |
| APP_DEPLOYMENT_KIND | development / tar / docker，仅表示交付介质 |

数据目录包括 installation.json（DSN 密文与安装 intent）、secret.key（若未外置）、bootstrap.token（仅安装前）、instance.lock、SQLite 时 unicore.db/WAL。不得删除安装状态来重新部署；缺少配置但存在 DB 时拒绝覆盖。profile 更换应新部署+独立迁移。已有非空或其他实例的 DB 不会被安装流程迁移。

外部数据库必须是当前实例独占空库，并有创建表/索引/约束权限。平台推荐 PostgreSQL/MySQL，SQLite 用于小型实例。DSN 只在输入和内存中为明文，持久配置为 AES-GCM 密文。生产连接启用 DB TLS。连接/迁移报错不回传完整 DSN。

## 密钥与安装故障

保持 DB、installation.json 和加密密钥成套备份；若 APP_SECRET_KEY 外置，另行受控保存。密钥丢失无法解密配置，应恢复原密钥，不能通过新生成密钥解密旧数据。不得把 key 放入镜像或 Git。

安装中断后带原 token 重试。重启会验证 DB 实例标记：已提交则恢复完成并吊销 token，未提交且属于本实例的部分 schema 可重试。外部数据库不可达/迁移权限不足时修正连接后重试。DB 已成功提交但配置收尾失败时，释放磁盘空间并重启，不再建管理员。

登录/注册默认图形验证码，注册关闭；无 SMTP 时保留至少一个可用本地管理员。后台路径误配可以通过 APP_ADMIN_PATH 恢复；环境覆盖不改变 API 的权限检查。

## Desktop / CLI

`make dev-desktop` 使用 Wails v2.12.0，默认系统 AppData/Unicore/desktop 自动 SQLite；APP_DATA_DIR 可隔离测试。没有安装/登录，用户表不会创建；进程锁防止同时使用同一目录。绑定生成不读写真实数据。macOS 需 Xcode tools，Linux Ubuntu22.04 需 WebKitGTK4.0，4.1 环境追加 webkit2_41；Windows 需 WebView2。

CLI 直接运行 `build/bin/unicore execute --text "Hello Unicore"`，不打开 HTTP/Wails/DB。仅业务文本分析无持久化，输入不会写日志。

## tar / Docker

`make release` 生成 Linux 双模式双架构 Web 和三系统双架构 CLI 预览包，包含 metadata/SHA-256。未签名，不可用于自动在线更新。

Nginx root 指向解压包 web/，/api/ 反代 loopback:8080，API 不回退 HTML。systemd 由运维创建 unicore 专用用户和 /var/lib/unicore，数据与密钥保存在该私有目录，服务只对此目录有写权限。

```sh
docker compose -f deploy/docker/compose.yaml up --build -d
# 容器内 /data/bootstrap.token 仅用于首次安装；由维护者安全读取
docker compose -f deploy/docker/compose.yaml down
```

compose 只映射宿主 loopback:8088，使用命名卷 unicore_data:/data，非 root/read-only image、仅数据卷可写。不要 down -v 删除真实实例卷。Docker 更新由外部 Compose/CI 替换镜像，保留卷；无 socket，不覆盖容器内 binary。当前模板本地 build，正式 pull 需配置镜像仓库。M1 本机镜像构建曾因 Docker Hub 超时失败；M2a 本机仅验证数据库测试容器，完整应用镜像运行仍待验证。

## 检查与备份边界

live 是进程存活；ready 要求已安装并 DB Ping 成功。测试通过独立临时目录/DB，不能使用生产数据库。提供 PostgreSQL/MySQL 测试 DSN 后 make test 会真实建表，仅用于空测试库。

M2a 没有备份/恢复命令。停机前后使用数据库原生一致性备份并保存加密配置/原密钥；具体自动化和演练属于 M4。不承诺不可逆 DDL 后只回滚二进制可恢复数据。

## SMTP、注册与密码恢复

只有平台提供邮件设置。先保存主机/端口/加密方式/发件人及可选登录凭据，再填测试收件邮箱，等待真实测试成功；最后开启所需的“开放注册（需验证邮箱）”/“邮件找回密码”/“邮箱验证码登录”。邮件策略不进入单机或桌面。密钥输入留空保留，清除按钮只在保存时清空；读取不会返回原值。更改 SMTP 前先关闭三项邮件流程，改完重测再开启。

推荐 STARTTLS 587 或 TLS 465；证书由系统根证书验证，不提供跳过验证选项。plain 仅供 loopback SMTP sink/本机 relay，不能用于远程明文凭据传输。测试通过表示 SMTP 已接受邮件，不保证收件箱投递。监控 SMTP 服务商告警、退信与配额；M2c 已使用经用户授权的 QQ SMTP 做四种模板真实投递，收件人确认显示正常；个人凭据不进入仓库。

账号邮件使用持久队列，由 server 进程运行。后台“邮件投递”展示最近 30 项的状态/尝试次数，失败自动重试最多 5 次，终止后由用户在登录页重新申请，避免把已过期验证码重新投入队列。错误仅显示 DELIVERY_FAILED/EXPIRED，不保留原始 SMTP 响应或凭据。进程重启可恢复过期租约，可能重复投递，邮件令牌仍只能使用一次。完成/终止/取消清空载荷，终态元数据在后台清理时保留最多 7 天。

M2a 升级前停服务并成套备份 DB、installation.json 与原密钥；新 server 验证实例归属后自动执行平台 0003/0004。迁移只增加表，重复启动校验 checksum，已有账号/设置保持。数据库权限不足时启动失败，修正后重试，不删版本记录。降级二进制前关闭注册/恢复/邮箱登录、停止 worker；旧版本无法处理邮件和新策略，完整恢复以原生一致性备份为准。

验证链接有效 30 分钟、重置链接 15 分钟。重发使旧链接失效，密码重置使所有设备会话失效。用户状态/角色被管理员改变也会撤销待用令牌。邮箱验证不会自动登录或授予管理权限。管理员通过受保护的用户管理手动启用待验证用户属于显式管理操作。

M2c 新表单使用 6 位数字，10 分钟有效，60 秒后重新申请，连续错误最多 5 次；未知/不适用账号申请保持统一提示。页面状态刷新后需重新申请验证码；冷却期间继续使用原页面的码，等待后再申请。旧验证/重置链接继续兼容原有效期，新 UI 不再发送链接。错误 TOKEN_INVALID 同时表示不存在/过期/已使用/次数用尽，不泄露具体账户状态。

主题修改与全套原生图标重建见 [设计系统](../02-standards/design-system.md)。macOS 请启动 build/desktop/bin/Unicore.app 应用包；系统关于、bundle 和窗口资源都来自同一品牌输入。

完整配置优先级、日志与监控端口见 [运行基座](../02-standards/runtime.md)。API 文档默认关闭，开发/受控环境可设 APP_API_DOCS=true；独立指标设 APP_MONITOR_LISTEN=127.0.0.1:9090，不映射公网。

Web 收到 SIGINT/SIGTERM 后停止接收新请求，等待在途请求默认最多 5 秒（APP_SHUTDOWN_TIMEOUT 可配置），再等待 worker 结束并关闭数据库；到期关闭连接并以错误退出。处理器须响应请求 context。基础能力的完成范围与剩余项见 [审计](../04-ai/foundation-audit.md)。

桌面生产/开发 bundle ID 分别为 vip.ebox.unicore 和 vip.ebox.unicore.dev，不再使用框架默认标识；本地数据目录不因该标识改变。旧目录中复制出的应用包需要重新构建/替换才能更新图标；本次只验证仓库生成的包，不自动删除系统内其他副本或清理全局图标缓存。

## M2d 角色升级

升级前停止服务，使用数据库原生一致性备份，并成套保存 installation.json 与原实例密钥。平台会自动执行 0005：以幂等 DML 增加 roles:read/roles:write 并授予既有 super_admin；不改旧角色授权，不修改历史 checksum。单机/桌面保持 framework-only。已验证从旧迁移级别恢复到最新、重复执行及用户/设置保持。

角色界面位于平台“角色权限”；超管创建业务角色，在用户管理中关联。内置角色不能改删，身份/角色/实例配置写入权限不可委派。有关联用户的角色须先改用户角色再删。角色保存会使关联用户退出并吊销待用账号挑战，需要重新登录。

旧版本用户接口只识别两个内置角色，不能假定它能安全编辑新业务角色；不要以仅替换旧 binary 作为恢复方案。若必须回到升级前状态，停服务后恢复同一时间点的 DB、配置与密钥，再启动匹配版本并检查登录与设置。新增角色 API 的审计记录只保留动作/角色 ID，不含密码或权限请求体。

## M3a OIDC 接入与恢复

仅平台启用。先确认安装登记的 BaseURL 为对外 HTTPS origin，再在企业 IdP 创建 OIDC 应用，登记「实例设置 → 企业身份服务检查」显示的精确 callback（包括 scheme/host/port/path）。默认使用 openid email profile；授权码、PKCE S256、签名 ID token 是必需条件。若使用机密客户端，支持 client_secret_basic/client_secret_post；public client 可不填密钥。绑定要求 IdP 支持 prompt=login/max_age=0 并返回新鲜 auth_time。

在实例设置保存 Issuer、Client ID、可选密钥，检查发现连接；通过只代表发现文档和端点可用，仍需用测试账号完成实际登录。确认后开启企业登录，按需要开启「首次登录创建普通账号」。JIT 用户必须有已验证邮箱，不存在于本地，且固定 user 权限；企业管理角色不导入。同邮箱已有本地用户应先密码登录，进入「账号安全」，确认本地密码后绑定；不要通过修改邮箱绕过归属证明。

仅本机隔离测试允许 literal loopback IP 的 HTTP，例如 127.0.0.1；不能用远程 HTTP、跳过证书验证或跨端点重定向。新装建议先填写实际 HTTPS 地址；已有开发实例若登记了错误 BaseURL，停服务并成套备份后仅修正 installation.json 的 base_url，再启动核对 callback，不能更改 profile/instance/DSN/密钥字段。生产反代需使用固定受信任的 host，身份服务必须可被后端访问。

每浏览器完成最新一次授权；过期/重放/校验失败请从登录按钮重新发起，旧地址不可重用。SSO-only 账号不能直接解绑；请由管理员按现有 SMTP 流程开放找回密码，完成邮箱验证设置本地密码后再解绑。绑定或解除后其他设备退出，待用验证码失效。账号禁用及本地角色改变依然撤销会话。外部 IdP 停用不会主动吊销已有本地 session，按需要缩短会话或本地禁用账号。

始终保留一个已验证能密码登录的本地超管。IdP 故障时使用登录页的本地账号入口，关闭 oidc.enabled 或修复配置；不删除绑定表。Client Secret 轮换先在 IdP 配置，再在本地保存新值，旧授权会因配置指纹变化失败，需要重新发起。修改 OIDC 配置不撤销已建立 session，如需立即撤销，应禁用对应本地账号。

升级前停服并保存一致的 DB/installation.json/密钥。平台自动执行 0006：新增企业身份与加密 flow 表，普通实例仍为 0001。已验证空库、0005 升级、重复执行、部分 DDL 后重试与原有账号保持。降级须恢复完整成套快照；SSO-only 用户无法直接使用旧版密码登录。当前无自动备份/回滚工具。

本机验收使用 tests/oidcprovider，只编入测试工具，不进入发布物。`make build-web && pnpm test:e2e` 自动构建该隔离服务，不需要真实企业凭据或外部邮件。

## M3b 品牌图片与恢复

“实例设置 → 实例品牌”分别选择 PNG/JPEG，检查预览后保存；深色 Logo 可单独覆盖，站点图标影响标签/触屏链接和 manifest。每项“恢复默认”需确认，恢复到编译品牌。普通设置编辑不能写 branding.* 引用。更换主题主色/原生图标仍需修改代码设计源并构建。

brand-assets/ 位于 APP_DATA_DIR（桌面为其配置目录）内，目录 0700、图片 0600。tar 部署不要覆盖数据目录；Docker 必须将整个数据目录持久挂载到镜像外，包含已有配置/密钥和新图片目录，不单独挂载只读图片。迁机或手工备份先停止实例，成套保存同一时间点 DB、installation.json、原密钥和 brand-assets。外部 DB 同样需要配套目录；不要只复制 SQL 引用。自动备份恢复工具仍属于 M4。

图片缺失会在界面回退默认；先检查目录挂载和文件权限，恢复同一快照的图片，或由管理员恢复默认再上传。不要手工塞原始图片或外部路径进 system_settings。换图会清理未引用的哈希文件；已缓存旧图可短暂保留至浏览器缓存失效，队列邮件使用创建时图片。当前只验证本地文件系统，尚未接对象存储/CDN。
