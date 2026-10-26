<!-- Author: yunnuo <ymz@ebox.vip> -->
# M2b 运行、安装与恢复边界

M2b 是开发预览，已有安装、身份、持久数据与邮件账号流程。OIDC/备份工具/授权/升级尚未实现，正式上线仍需后续验收。

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

只有平台提供邮件设置。先保存主机/端口/加密方式/发件人及可选登录凭据，再填测试收件邮箱，等待真实测试成功；最后开启“开放注册（需验证邮箱）”/“邮件找回密码”。邮件策略不进入单机或桌面。密钥输入留空保留，清除按钮只在保存时清空；读取不会返回原值。更改 SMTP 前先关闭两项邮件流程，改完重测再开启。

推荐 STARTTLS 587 或 TLS 465；证书由系统根证书验证，不提供跳过验证选项。plain 仅供 loopback SMTP sink/本机 relay，不能用于远程明文凭据传输。测试通过表示 SMTP 已接受邮件，不保证收件箱投递。监控 SMTP 服务商告警、退信与配额；本次未发送外部真实邮件。

账号邮件使用持久队列，由 server 进程运行。后台“邮件投递”展示最近 30 项的状态/尝试次数，失败自动重试最多 5 次，终止后由用户在登录页重新申请，避免把已过期链接重新投入队列。错误仅显示 DELIVERY_FAILED/EXPIRED，不保留原始 SMTP 响应或凭据。进程重启可恢复过期租约，可能重复投递，邮件令牌仍只能使用一次。完成/终止/取消清空载荷，终态元数据在后台清理时保留最多 7 天。

M2a 升级前停服务并成套备份 DB、installation.json 与原密钥；新 server 验证实例归属后自动执行平台 0003。迁移只增加表，重复启动校验 checksum，已有账号/设置保持。数据库权限不足时启动失败，修正后重试，不删版本记录。降级二进制前关闭注册/恢复、停止 worker；旧版本无法处理邮件和新策略，完整恢复以原生一致性备份为准。

验证链接有效 30 分钟、重置链接 15 分钟。重发使旧链接失效，密码重置使所有设备会话失效。用户状态/角色被管理员改变也会撤销待用令牌。邮箱验证不会自动登录或授予管理权限。管理员通过受保护的用户管理手动启用待验证用户属于显式管理操作。
