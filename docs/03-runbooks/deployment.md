<!-- Author: yunnuo <ymz@ebox.vip> -->
# 运行、安装与恢复边界

当前为开发预览，已有安装、身份、持久数据、邮件账号与 OIDC 流程。备份工具/授权/升级尚未实现，正式上线仍需后续验收。

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

数据目录包括 installation.json（DSN 密文与安装 intent）、secret.key（若未外置）、bootstrap.token（仅安装前）、instance.lock、SQLite 时 unicore.db/WAL。不得删除安装状态来重新部署；缺少配置但存在 DB 时拒绝覆盖。profile 更换应新部署+独立迁移。其他已安装实例的 DB 始终拒绝接管；未安装非空库只有明确勾选清空并精确输入目标库名后才能初始化。

两个 Web 安装页默认 MySQL，PostgreSQL 同为在线推荐；SQLite 需显式选择。MySQL 分开填写地址（默认 127.0.0.1）、端口（3306）、数据库名（unicore）、用户名（root）、密码；PostgreSQL 默认端口 5432、用户名 postgres。先由运维创建当前实例独占数据库并授予表/索引/约束和必要清空权限，框架不创建数据库本身。Docker 里的 127.0.0.1 指当前容器；同网络数据库填服务名，宿主机数据库按 Docker 网络配置填写可达地址。

三种数据库都必须点击“测试连接”成功才能继续，任何连接字段改变使结果失效。测试只连接和检查已有对象/安装标记，不清空、不迁移。空库直接创建；非空专用库显示数量和不可逆警告，必须先备份，再勾选并输入完全一致的库名。MySQL 清空选定库的表和视图，PG 限独占 public schema 并拒绝其他用户 schema，SQLite 固定私有 unicore.db。已有 Unicore 标记不得清空，恢复原实例配置。MySQL 清空可部分完成，修正权限后重新测试、确认；不能靠重启自动继续删除。

结构化字段经驱动安全构造 DSN，密码特殊字符无需自行转义；旧 API dsn 仅兼容保留。持久配置是 AES-GCM 密文，错误不回传连接串。TLS 自动在本机直连、远程验证证书；受控内网可显式关闭，公网使用验证证书 TLS。详细规则见 [安装规范](../00-product/feature-installation.md)。

## 密钥与安装故障

bootstrap.token 用于证明服务器所有权、防止别人抢先建管理员，与加密密钥独立。首次启动已自动生成；页面“生成新凭据”需先填写当前有效值，新值保存到服务器文件，旧值失效。不持有原凭据时，运维可在未安装状态停服务后通过 APP_BOOTSTRAP_TOKEN 注入新值，启动读取后移除环境覆盖；再次带固定环境覆盖启动会恢复该注入值。不要匿名发放或把 token 当作 APP_SECRET_KEY。

保持 DB、installation.json 和加密密钥成套备份；若 APP_SECRET_KEY 外置，另行受控保存。密钥丢失无法解密配置，应恢复原密钥，不能通过新生成密钥解密旧数据。不得把 key 放入镜像或 Git。

安装中断后带原 token 重试。重启会验证 DB 实例标记：已提交则恢复完成并吊销 token，未提交且属于本实例的部分 schema 可重试。外部数据库不可达/迁移权限不足时修正连接后重试。DB 已成功提交但配置收尾失败时，释放磁盘空间并重启，不再建管理员。已 INSTALLED 时 DB 不可达、安装表/标记缺失、实例归属不符会拒绝启动，不会自动重装；恢复同一时间点的 DB、配置和密钥后重启。

登录/注册默认图形验证码，注册关闭；无 SMTP 时保留至少一个可用本地管理员。后台路径误配可以通过 APP_ADMIN_PATH 恢复；环境覆盖不改变 API 的权限检查。

## Desktop / CLI

`make dev-desktop` 使用 Wails v2.12.0，默认系统 AppData/Unicore/desktop 自动 SQLite；APP_DATA_DIR 可隔离测试。没有安装/登录，用户表不会创建；进程锁防止同时使用同一目录。绑定生成不读写真实数据。macOS 需 Xcode tools，Linux Ubuntu22.04 需 WebKitGTK4.0，4.1 环境追加 webkit2_41；Windows 需 WebView2。

CLI 直接运行 `build/bin/unicore execute --text "Hello Unicore"`，不打开 HTTP/Wails/DB。仅业务文本分析无持久化，输入不会写日志。

## Tar / 宝塔 / Nginx

快速构建、统一版本与发版流程见 [发版手册](release.md)。Linux amd64 服务器使用 `make package RELEASE_TARGETS=linux/amd64 RELEASE_PROFILES=web-platform`，ARM 服务器改 arm64。目标机器无需 Go/Node。核对 checksums.txt 后解压到 `/opt/unicore/releases/<版本>`，让 `/opt/unicore/current` 指向该目录；将数据单独放在 `/var/lib/unicore`，禁止放进公开站点根目录。

```sh
# 以下由运维在新服务器执行，路径按实际包名调整
sudo useradd --system --home /var/lib/unicore --shell /usr/sbin/nologin unicore
sudo install -d -m 700 -o unicore -g unicore /var/lib/unicore
sudo cp /opt/unicore/current/deploy/unicore.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now unicore
sudo -u unicore cat /var/lib/unicore/bootstrap.token
```

可选配置文件 `/etc/unicore/unicore.env`（0600）；配置项见上表和 [运行基座](../02-standards/runtime.md)。服务默认只听 127.0.0.1:8080，日志走 journal，排空超时默认 5 秒、systemd 停止等待 15 秒。

普通 Nginx 使用包内 deploy/nginx.conf.example，改 listen/server_name/root 并开启 HTTPS。宝塔创建静态站点，站点目录指向包内 web/，在站点配置中合并该 server 内的 location；不要再叠加宝塔的通用 SPA 伪静态。assets/ 由 Nginx 直接读取，其余路径反代 127.0.0.1:8080 并保留 Host。HTML 壳由 Go 处理以保持 `/install`、自定义后台、品牌/manifest 和文档开关的一致行为；不是将 index.html 直接公开的纯静态托管。替换配置前 `nginx -t`，验证后 reload。宝塔使用自己的 Nginx 可执行文件和面板重载入口。

浏览器首次访问实际域名，必须跳转 `/install`，录入私有 token、数据库及管理员；访问地址自动取当前浏览器 origin，无需填写，请从最终实际 HTTPS 域名安装。演示可手动设置 `admin / Admin@123456`；生产填写自己的密码，框架不预置账号。安装完成 `/install` 回首页、原 token 失效，设置与账号重启保留。后台默认 `/admin`；修改后旧路径 404。远程单机没有身份模块，需外层认证/ACL。Nginx 另行配置 TLS、边缘限流和访问策略，Go 不将 X-Forwarded-For 视为真实客户端地址。

## Docker / Compose

```sh
export UNICORE_VERSION="$(cat VERSION)" UNICORE_IMAGE="unicore:$(cat VERSION)"
make compose-up
# distroless 没有 shell/cat；复制凭据到权限受限的临时目录后读取
umask 077
mkdir -p /tmp/unicore-install-private
docker compose -f deploy/docker/compose.yaml cp app:/data/bootstrap.token /tmp/unicore-install-private/token
cat /tmp/unicore-install-private/token
rm /tmp/unicore-install-private/token
make compose-down
```

Compose 每次解析（包括 cp/logs/ps）均需要版本变量：在当前终端先执行 `export UNICORE_VERSION="$(cat VERSION)" UNICORE_IMAGE="unicore:$(cat VERSION)"`，或使用 Make 的 up/down 自动注入。默认访问 127.0.0.1:8088，可用 `UNICORE_PORT=8090 make compose-up` 修改本地端口。公网入口仍由 HTTPS 反代，保留外部 Host；安装页会自动登记访问 origin，应从真实公网 HTTPS 域名安装。live 在未安装时为 200、ready 为 503，安装和数据库可用后 ready 为 200；外部监控应区分这两者。

不用 Compose 时先 `make docker-build`，然后：

```sh
docker run -d --name unicore --read-only --cap-drop=ALL \
  --security-opt=no-new-privileges:true --stop-timeout=15 \
  -p 127.0.0.1:8088:8080 -v unicore_data:/data "unicore:$(cat VERSION)"
```

镜像为 nonroot，根目录只读，命名卷保存完整 `/data`。已有 bind mount 需要管理员提前设置目录为 UID/GID 65532、0700；框架不会自动放宽权限。数据/密钥/本地 env 不进入 Docker build context。不要 `down -v` 删除真实实例卷。替换镜像由外部 Compose/CI 完成，保留卷；不挂载 socket，不覆盖容器内 binary。

使用预构建镜像可先设置 UNICORE_VERSION/UNICORE_IMAGE，再 `docker compose -f deploy/docker/compose.yaml up -d --no-build --pull always`；正式仓库地址由维护者配置。更新前停服成套备份，替换包 current 链接或镜像后启动、检查 ready、登录与数据。回退受迁移兼容约束，不能只替换旧程序。当前同版本替换与卷保留验收见 [部署验收](../04-ai/acceptance-deployment.md)，自动恢复/签名 OTA 仍未实现。

## 检查与备份边界

live 是进程存活；ready 要求已安装并 DB Ping 成功。测试通过独立临时目录/DB，不能使用生产数据库。提供 PostgreSQL/MySQL 测试 DSN 后 make test 会真实建表，仅用于空测试库。

M2a 没有备份/恢复命令。停机前后使用数据库原生一致性备份并保存加密配置/原密钥；具体自动化和演练属于 M4。不承诺不可逆 DDL 后只回滚二进制可恢复数据。

## SMTP、注册与密码恢复

只有平台提供邮件设置。进入「实例设置 → 邮件服务」，先保存主机/端口/加密方式/发件人及可选登录凭据，再到「发送测试」填测试收件邮箱，等待真实测试成功；最后在「账号流程」开启所需的“开放注册（需验证邮箱）”/“邮件找回密码”/“邮箱验证码登录”。邮件策略不进入单机或桌面。密钥输入留空保留，清除按钮只在保存时清空；读取不会返回原值。更改 SMTP 前先关闭三项邮件流程，改完重测再开启。

推荐 STARTTLS 587 或 TLS 465；证书由系统根证书验证，不提供跳过验证选项。plain 仅供 loopback SMTP sink/本机 relay，不能用于远程明文凭据传输。测试通过表示 SMTP 已接受邮件，不保证收件箱投递。监控 SMTP 服务商告警、退信与配额；M2c 已使用经用户授权的 QQ SMTP 做四种模板真实投递，收件人确认显示正常；个人凭据不进入仓库。

账号邮件使用持久队列，由 server 进程运行。“实例设置 → 投递记录”展示最近 30 项的状态/尝试次数，失败自动重试最多 5 次，终止后由用户在登录页重新申请，避免把已过期验证码重新投入队列。错误仅显示 DELIVERY_FAILED/EXPIRED，不保留原始 SMTP 响应或凭据。进程重启可恢复过期租约，可能重复投递，邮件令牌仍只能使用一次。完成/终止/取消清空载荷，终态元数据在后台清理时保留最多 7 天。

M2a 升级前停服务并成套备份 DB、installation.json 与原密钥；新 server 验证实例归属后自动执行平台 0003/0004。迁移只增加表，重复启动校验 checksum，已有账号/设置保持。数据库权限不足时启动失败，修正后重试，不删版本记录。降级二进制前关闭注册/恢复/邮箱登录、停止 worker；旧版本无法处理邮件和新策略，完整恢复以原生一致性备份为准。

验证链接有效 30 分钟、重置链接 15 分钟。重发使旧链接失效，密码重置使所有设备会话失效。用户状态/角色被管理员改变也会撤销待用令牌。邮箱验证不会自动登录或授予管理权限。管理员通过受保护的用户管理手动启用待验证用户属于显式管理操作。

M2c 新表单使用 6 位数字，10 分钟有效，60 秒后重新申请，连续错误最多 5 次；未知/不适用账号申请保持统一提示。页面状态刷新后需重新申请验证码；冷却期间继续使用原页面的码，等待后再申请。旧验证/重置链接继续兼容原有效期，新 UI 不再发送链接。错误 TOKEN_INVALID 同时表示不存在/过期/已使用/次数用尽，不泄露具体账户状态。

主题修改与全套原生图标重建见 [设计系统](../02-standards/design-system.md)。macOS 请启动 build/desktop/bin/Unicore.app 应用包；系统关于、bundle 和窗口资源都来自同一品牌输入。

完整配置优先级、日志与监控端口见 [运行基座](../02-standards/runtime.md)。API 文档默认关闭，开发/受控环境可设 APP_API_DOCS=true；独立指标设 APP_MONITOR_LISTEN=127.0.0.1:9090，不映射公网。

Web 收到 SIGINT/SIGTERM 后停止接收新请求，等待在途请求默认最多 5 秒（APP_SHUTDOWN_TIMEOUT 可配置），再等待 worker 结束并关闭数据库；到期关闭连接并以错误退出。处理器须响应请求 context。基础能力的完成范围与剩余项见 [审计](../04-ai/foundation-audit.md)。

桌面生产/开发 bundle ID 分别为 vip.ebox.unicore 和 vip.ebox.unicore.dev，不再使用框架默认标识；本地数据目录不因该标识改变。旧目录中复制出的应用包需要重新构建/替换才能更新图标；本次只验证仓库生成的包，不自动删除系统内其他副本或清理全局图标缓存。

## 固定两角色升级（平台迁移 0007）

升级前停止 server 与 worker，确认没有其他实例连接同一数据库；使用数据库原生一致性备份，并成套保存私有 data dir、installation.json 与原实例密钥。新 server 在验证归属后自动按顺序运行至 0007；历史 checksum 不变。SQLite/PostgreSQL 使用迁移事务，MySQL 采用幂等 DML，失败修正后可重启继续，不能删除迁移记录绕过检查。

管理员 super_admin 保留；所有旧自定义角色关联移除，无内置角色的账号归为 user；同时关联管理员和其他角色的账号仅保留管理员。账号、密码、邮箱及其他设置保留。自定义角色和普通用户 grants 删除，角色页改为只读两角色矩阵。全部存量会话、账号令牌、数字码和 OIDC 授权流程失效；pending/sending 邮件取消且清空载荷，已投递历史保留。升级后所有用户重新登录，未完成的验证/找回需重新申请。

appearance.theme 从平台全局设置删除，平台主题只存当前浏览器；已有客户端的本地选择保留，没有本地选择时跟随系统。普通用户只显示外观入口，管理员管理所有全局配置。单机/桌面只运行 framework 迁移，不受平台数据收敛影响。

验收：用原管理员登录，检查用户数量/两角色、站点与 SMTP 配置状态；普通用户检查无管理菜单，直接管理 API 返回 403，外观保存只影响本客户端。0007 含删除旧角色/凭据，不能只换旧 binary 回退。恢复时停服，恢复同一时间点的数据库、data dir、installation.json、密钥和匹配版本程序后再启动，禁止用新配置配旧 DB。框架当前没有自动备份恢复工具。三数据库实测见 [权限验收](../04-ai/acceptance-permissions.md)。

## M3a OIDC 接入与恢复

仅平台启用。先确认安装登记的 BaseURL 为对外 HTTPS origin，再在企业 IdP 创建 OIDC 应用，登记「实例设置 → 连接检查」显示的精确 callback（包括 scheme/host/port/path）。默认使用 openid email profile；授权码、PKCE S256、签名 ID token 是必需条件。若使用机密客户端，支持 client_secret_basic/client_secret_post；public client 可不填密钥。绑定要求 IdP 支持 prompt=login/max_age=0 并返回新鲜 auth_time。

在实例设置保存 Issuer、Client ID、可选密钥，检查发现连接；通过只代表发现文档和端点可用，仍需用测试账号完成实际登录。确认后开启企业登录，按需要开启「首次登录创建普通账号」。JIT 用户必须有已验证邮箱，不存在于本地，且固定 user 权限；企业管理角色不导入。同邮箱已有本地用户应先密码登录，进入「账号安全」，确认本地密码后绑定；不要通过修改邮箱绕过归属证明。

仅本机隔离测试允许 literal loopback IP 的 HTTP，例如 127.0.0.1；不能用远程 HTTP、跳过证书验证或跨端点重定向。新装应直接从实际 HTTPS 域名进入 /install，页面自动登记该 origin；已有开发实例若登记了错误 BaseURL，停服务并成套备份后仅修正 installation.json 的 base_url，再启动核对 callback，不能更改 profile/instance/DSN/密钥字段。生产反代需使用固定受信任的 host，身份服务必须可被后端访问。

每浏览器完成最新一次授权；过期/重放/校验失败请从登录按钮重新发起，旧地址不可重用。SSO-only 账号不能直接解绑；请由管理员按现有 SMTP 流程开放找回密码，完成邮箱验证设置本地密码后再解绑。绑定或解除后其他设备退出，待用验证码失效。账号禁用及本地角色改变依然撤销会话。外部 IdP 停用不会主动吊销已有本地 session，按需要缩短会话或本地禁用账号。

始终保留一个已验证能密码登录的本地超管。IdP 故障时使用登录页的本地账号入口，关闭 oidc.enabled 或修复配置；不删除绑定表。Client Secret 轮换先在 IdP 配置，再在本地保存新值，旧授权会因配置指纹变化失败，需要重新发起。修改 OIDC 配置不撤销已建立 session，如需立即撤销，应禁用对应本地账号。

升级前停服并保存一致的 DB/installation.json/密钥。平台自动执行 0006：新增企业身份与加密 flow 表，普通实例仍为 0001。已验证空库、0005 升级、重复执行、部分 DDL 后重试与原有账号保持。降级须恢复完整成套快照；SSO-only 用户无法直接使用旧版密码登录。当前无自动备份/回滚工具。

本机验收使用 tests/oidcprovider，只编入测试工具，不进入发布物。`make build-web && pnpm test:e2e` 自动构建该隔离服务，不需要真实企业凭据或外部邮件。

## M3b 品牌图片与恢复

“实例设置 → 实例品牌”分别选择 PNG/JPEG（站点图标也可选 ICO），检查预览后保存；深色 Logo 可单独覆盖，站点图标影响标签/触屏链接和 manifest。每项“恢复默认”需确认，恢复到编译品牌。普通设置编辑不能写 branding.* 引用。更换主题主色/原生图标仍需修改代码设计源并构建。

brand-assets/ 位于 APP_DATA_DIR（桌面为其配置目录）内，目录 0700、图片 0600。tar 部署不要覆盖数据目录；Docker 必须将整个数据目录持久挂载到镜像外，包含已有配置/密钥和新图片目录，不单独挂载只读图片。迁机或手工备份先停止实例，成套保存同一时间点 DB、installation.json、原密钥和 brand-assets。外部 DB 同样需要配套目录；不要只复制 SQL 引用。自动备份恢复工具仍属于 M4。

图片缺失会在界面回退默认；先检查目录挂载和文件权限，恢复同一快照的图片，或由管理员恢复默认再上传。不要手工塞原始图片或外部路径进 system_settings。换图会清理未引用的哈希文件；已缓存旧图可短暂保留至浏览器缓存失效，队列邮件使用创建时图片。当前只验证本地文件系统，尚未接对象存储/CDN。


## 设置与可选授权/升级占位

备案号/HTTPS 查询链接在“实例设置 → 站点信息”保存，登录页与工作台共用；编号留空隐藏。SMTP 别名留空跟随站点名，填写后用于测试/账号/系统通知显示名；密钥仍只显示配置状态。业务通知调用与限制见 [设置规范](../00-product/feature-settings.md)。

默认构建剔除授权/升级卡片与接入 port。需要占位界面时，前后端必须使用同一组编译输入：

```sh
make build-web FEATURE_LICENSE=true FEATURE_UPDATER=true
make build-desktop FEATURE_LICENSE=true FEATURE_UPDATER=true
make release FEATURE_LICENSE=true FEATURE_UPDATER=false
```

两项均可独立 true/false，非法值使构建失败。make dev-server/dev-web/dev-desktop 使用相同变量；直接 pnpm/Vite 构建需传入对应 FEATURE_* 环境变量，直接 go build 需对应 -tags license,updater。生产进程启动后修改 FEATURE_* 不会重新引入被裁剪代码。Docker 构建参数为 --build-arg FEATURE_LICENSE=true / --build-arg FEATURE_UPDATER=true，两阶段使用同一输入；推荐 make docker-build FEATURE_LICENSE=true。镜像实际验收范围见部署验收。

前端产物 features.json 记录编译能力；后端 bootstrap.capabilities 返回相应占位能力，CLI 始终 false。页面同时检查两端能力，任一端关闭都不显示。开启也只是“待对接”卡片、禁用检查按钮、空更新日志，不产生外部请求或执行安装；真实对接后才增加 API/权限/签名与按部署方式的更新流程。测试构建和 E2E 时同样传入相同变量。
