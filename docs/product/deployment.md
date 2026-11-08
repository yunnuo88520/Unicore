<!-- Author: yunnuo <ymz@ebox.vip> -->
# Web 从零部署：Docker、Compose 与 tar/systemd

本文按“准备环境 → 启动程序 → 配置入口 → 首次安装 → 检查 → 日常维护”的顺序部署。选择 Docker 命令、Docker Compose、tar/systemd 中的一种即可；三种方式使用相同的安装向导。完整参数表见 [配置说明](configuration.md)，自行构建见 [构建指南](build.md)。

网站文档随 main 更新；下载包内文档对应该包的版本。示例版本 `0.1.2` 仅用于说明命名，实际使用 [Releases](https://github.com/yunnuo88520/Unicore/releases) 中存在的版本。尚未发布的新功能需从对应提交构建，不会因同一个 VERSION 自动出现在旧下载包中。

::: tip 最快路径（已决定用 tar + systemd 时）
1. 从 [Releases](https://github.com/yunnuo88520/Unicore/releases) 下载与架构匹配的 `web-platform` 完整包和 `checksums.txt`，`sha256sum -c` 校验通过再继续。
2. 解压到新版本目录，执行 `./unicore config generate && sudo ./unicore service install --config config.yaml`，程序自动生成 systemd 服务并启动。
3. 浏览器打开 `http://<服务器地址>/install`，输入私有数据目录中的 `bootstrap.token` 完成安装向导。数据库准备与 HTTPS 入口按下文第 2、6 节执行。

:::

## 1. 先选择形态与部署环境

| 形态 | 适用场景 | 身份、数据库与网络 |
| --- | --- | --- |
| `web-platform` | 服务器、多用户在线站点 | 独立管理员/用户入口；SQLite、PostgreSQL、MySQL；公网使用域名和 HTTPS |
| `web-standalone` | 自己电脑上的浏览器应用 | 同样需要安装数据库；没有登录、用户管理、SMTP 或全局后台；只监听本机，远程访问另配 VPN/访问认证 |
| `desktop` | 原生 GUI | 安装桌面包直接运行，自动使用本地 SQLite，不需要本页的 Nginx/systemd/安装向导 |
| `cli` | 命令行执行核心业务 | 解压后运行 `./unicore`，不启动 Web、不创建数据库 |

以下服务器示例使用 **Linux + web-platform**。Web 单机使用相同二进制部署方式，在首次向导选择 `web-standalone`；不要将没有账号验证的单机版直接暴露到公网。需要远程个人使用时，优先 SSH 隧道或 VPN；仅换端口不构成访问控制。

### 环境与资源

| 项目 | 准备内容 |
| --- | --- |
| 系统 | tar/systemd 命令以 Ubuntu 22.04/24.04、Debian 12 等 systemd Linux 为例；其他发行版调整包管理、服务用户和 Nginx 路径 |
| 架构 | `uname -m`：`x86_64` 选 `linux-amd64`，`aarch64`/`arm64` 选 `linux-arm64`；不混用架构 |
| 资源 | 小型试用可从 2 核、2 GiB 内存和 10 GiB 可用磁盘开始规划；这是起步建议，不是容量保证。上传、日志、备份与本机数据库另留空间 |
| 权限 | sudo/root 用于创建服务用户、目录、systemd/Nginx；程序本身以非 root 身份运行 |
| Docker 路径 | 已安装并启动 Docker Engine，`docker version` 可用；Compose 使用 V2 插件，`docker compose version` 可用 |
| tar 路径 | 安装 `curl`、`tar`、CA 证书；运行预构建包不需要 Go、Node、pnpm，也不需要单独安装 SQLite 服务 |
| 源码构建 | 另需 Git、Go 1.26.10+、Node（满足 package.json engines）、pnpm 11.25.0、make/ripgrep；Docker 构建所需 Go/Node 已在构建镜像中 |
| 数据库 | 准备专用空库和账号，推荐 PostgreSQL 15 或 Oracle MySQL 8.0；SQLite 适合本机/小型试用，不应从示例推断高并发能力 |
| 域名与 TLS | 平台公网部署先准备域名、DNS A/AAAA 和证书，示例使用 `app.example.com`，均需换成自己的值 |
| 端口 | 公网只放行 HTTPS 443；HTTP 80 用于跳转/证书签发；SSH 按运维策略开放。应用 3000 和数据库 5432/3306 只给本机/私网 |
| 出站访问 | 构建需访问源码/镜像仓库；注册邮箱验证、邮件登录与找回密码需 SMTP，直接注册无需 SMTP；企业登录需 IdP；对象存储和更新按启用功能放通 |

Ubuntu/Debian 的 tar 路径可先执行：

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl tar nginx
uname -m
```

Docker 按 [官方 Linux 安装说明](https://docs.docker.com/engine/install/) 安装，确认服务启动。宿主机跑预构建镜像/二进制不需要安装前端开发工具。源码构建时使用干净源码目录，把生产数据与配置放在源码之外。

### 数据放在哪里

| 部署方式 | 程序/配置 | 持久化数据 |
| --- | --- | --- |
| tar/systemd | `/opt/unicore/releases/<版本>`、`/opt/unicore/current`；可选 `/etc/unicore/unicore.env` | `/var/lib/unicore`，服务用户独占 |
| Docker 命令 | 固定版本本地镜像 `unicore:<版本>` | 命名卷 `unicore_data` → 容器 `/data` |
| 本文 Compose | `/opt/unicore-compose/compose.yaml`、私有 `.env` | `unicore_data` 和 `unicore_postgres_data` 两个命名卷 |

完整数据目录包括 `installation.json`、`secret.key`（未外置时）、`install.lock`、私有文件，以及 SQLite 的 `unicore.db`/WAL 等。只保留数据库或只保留上传文件都不足以恢复实例；外部数据库仍需要配套的数据目录和密钥。

## 2. 准备数据库

选择 SQLite 可跳过建库步骤，安装页显式选 SQLite，文件固定在私有数据目录。Docker 使用的 SQLite 也必须保留 `/data` 卷。

使用外部 PostgreSQL/MySQL 时，应用不会替你创建数据库。请先创建专用空库和专用账号，不将共享业务库、系统库或未知非空库填入向导。本文 Compose 自带 PostgreSQL，选它可跳到第 4 节。

### PostgreSQL

以下在数据库服务器的管理终端执行；`\password` 交互设置密码，避免把真实口令写进 SQL 文件和 shell 历史：

```sh
sudo -u postgres psql
```

```sql
CREATE ROLE unicore LOGIN;
\password unicore
CREATE DATABASE unicore OWNER unicore;
\connect unicore
GRANT USAGE, CREATE ON SCHEMA public TO unicore;
\quit
```

应用账号作为专用库及所建对象的所有者，需能创建/修改表、索引、约束和执行迁移。该库的 `public` schema 由此实例独占，不放其他业务；安装会拒绝其他用户 schema。跨主机按数据库文档配置 `listen_addresses`、`pg_hba.conf` 和私网访问规则，只允许应用主机连接。

### MySQL 8.0

在 MySQL 管理客户端中执行下列语句。**先把占位密码和账号来源地址改为实际值**；下例 `10.0.0.20` 代表应用在数据库侧看到的来源地址，Docker 可能是桥接网段，不能机械照抄，也不建议默认授予任意 `%` 来源。

```sql
CREATE DATABASE unicore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'unicore'@'10.0.0.20' IDENTIFIED BY 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD';
GRANT ALL PRIVILEGES ON unicore.* TO 'unicore'@'10.0.0.20';
```

权限限于这一专用库，不需要全局 root 权限。数据库端口仅向应用网络开放。MySQL 的 DDL 可能部分提交，安装或升级中断后不能认为所有改动都已回滚。

### 安装页填写对照

| 字段 | PostgreSQL | MySQL | SQLite |
| --- | --- | --- | --- |
| 驱动 | `postgres` | `mysql` | `sqlite` |
| 地址 | 数据库私网地址；本文 Compose 为 `db` | 数据库私网地址/同网络服务名 | 无需填写 |
| 端口 | `5432` | `3306` | 无需填写 |
| 数据库 | 例如 `unicore` | 例如 `unicore` | 固定 `unicore.db` |
| 用户名 | 上面创建的 `unicore` | 上面创建的 `unicore` | 无需填写 |
| 密码 | 管理员设置的数据库密码 | 管理员设置的数据库密码 | 无需填写 |
| TLS | 默认关闭；按数据库实际支持开启 | 默认关闭；按数据库实际支持开启 | 不适用 |

**容器里的 `127.0.0.1` 是应用容器自己**。同一 Compose 网络内填 `db`，连接外部数据库填容器可达的私网地址。宿主机数据库不能仅监听其回环地址后期待容器能访问；Docker Desktop 可按其说明使用 `host.docker.internal`，Linux 需自行配置可达地址/host-gateway 和数据库监听/防火墙。

安装页 TLS 开关当前仅加密连接：PostgreSQL 为 `sslmode=require`，MySQL 为 `skip-verify`，不校验证书身份。需严格身份校验的环境应核对兼容 DSN 通道及数据库证书方案，不能把该开关当作完整证书验证；详情见 [配置说明](configuration.md)。

## 3. Docker 命令部署

### 3.1 获取镜像

公开镜像随后续发行版本在 `ghcr.io/yunnuo88520/unicore` 提供，是否可用以对应 Release 说明为准；**已发布的旧版本没有镜像**，不要直接假设 `docker pull unicore` 可用。下面从源码构建本地镜像；若你的产品维护者提供可信镜像，改用其明确版本/digest，并跳过构建。

```sh
git clone https://github.com/yunnuo88520/Unicore.git
cd Unicore
# 部署发行版本时先切换到对应实际存在的 tag；构建开发提交则核对 git rev-parse HEAD。
export UNICORE_VERSION="$(cat VERSION)"
export UNICORE_IMAGE="unicore:${UNICORE_VERSION}"
docker build -f deploy/docker/Dockerfile \
  --build-arg VERSION="$UNICORE_VERSION" \
  --build-arg FEATURE_LICENSE=false --build-arg FEATURE_UPDATER=false \
  -t "$UNICORE_IMAGE" .
```

这会构建共享 Web 镜像；运行时首次安装选择具体 Web 形态。此例关闭容器内更新功能，容器升级由宿主机替换镜像。源码开发也可用 `make docker-build`，其功能开关默认值见 [构建指南](build.md)，不要混淆构建与部署配置。

### 3.2 创建持久卷并启动

```sh
docker volume create unicore_data
docker run -d --name unicore --restart unless-stopped \
  --read-only --cap-drop=ALL --security-opt=no-new-privileges:true \
  --stop-timeout=15 \
  -e APP_PROFILE=web-platform \
  -p 127.0.0.1:3000:3000 \
  -v unicore_data:/data \
  "$UNICORE_IMAGE"
docker logs --tail 100 unicore
curl -fsS http://127.0.0.1:3000/api/v1/health/live
```

镜像默认 `APP_LISTEN=0.0.0.0:3000`、`APP_DATA_DIR=/data`、`APP_DEPLOYMENT_KIND=docker`，以 UID/GID `65532:65532` 运行。容器内监听所有接口是为了端口映射；宿主机仍只绑定 `127.0.0.1:3000`。不要把容器内监听改成回环地址，否则映射端口无法访问。

命名卷初始化会继承镜像内 `/data` 的权限。使用宿主机目录代替卷时，先创建独立目录并设置 UID/GID `65532:65532`、权限 `0700`，例如 `sudo install -d -m 700 -o 65532 -g 65532 /srv/unicore-data`，再用 `-v /srv/unicore-data:/data`。SELinux 主机还需按当地策略设置挂载标签。不要通过 `chmod 777` 处理密钥目录权限。

### 3.3 读取首次安装凭据

distroless 镜像没有 shell、`cat` 或 `curl`；不能使用 `docker exec unicore sh`。在宿主机执行：

```sh
umask 077
unicore_token_dir=$(mktemp -d)
docker cp unicore:/data/bootstrap.token "$unicore_token_dir/bootstrap.token"
cat "$unicore_token_dir/bootstrap.token"
# 复制到安装页后移除本机临时副本
rm -f "$unicore_token_dir/bootstrap.token"
rmdir "$unicore_token_dir"
```

token 只供当前服务器所有者完成首次安装，不发给其他人。接着按第 6 节配置 HTTPS 入口、第 7 节完成向导；本机试用可直接访问 `http://127.0.0.1:3000/install`。

常用命令：

```sh
docker logs -f --tail 100 unicore
docker stop unicore
docker start unicore
docker restart unicore
```

## 4. Docker Compose 部署（带 PostgreSQL）

这一方案包含应用、独立数据库和持久卷，无需在宿主机安装 PostgreSQL。先按 3.1 构建镜像；以下 `compose.yaml` **没有源码 build 配置**，可以在独立部署目录运行。若只想用 SQLite/已有数据库，删去 `db` 服务和 app 的 `depends_on`，保留应用数据卷，并在向导选择相应驱动。

### 4.1 创建部署目录与私有环境文件

```sh
sudo install -d -m 700 -o "$(id -u)" -g "$(id -g)" /opt/unicore-compose
cd /opt/unicore-compose
umask 077
```

创建 `.env`，镜像名与 3.1 构建结果一致，数据库口令换成自己的长随机值。此文件用于 Compose 变量替换，不是应用启动 YAML/JSON，也不会被应用自动读取。

```dotenv
UNICORE_IMAGE=unicore:0.1.2
UNICORE_PORT=3000
POSTGRES_PASSWORD=REPLACE_WITH_A_LONG_RANDOM_PASSWORD
```

```sh
chmod 600 .env
```

### 4.2 创建 compose.yaml

```yaml
# Author: yunnuo <ymz@ebox.vip>
services:
  app:
    image: ${UNICORE_IMAGE:?Set UNICORE_IMAGE in .env}
    environment:
      APP_PROFILE: web-platform
      APP_LISTEN: 0.0.0.0:3000
      APP_DATA_DIR: /data
      APP_DEPLOYMENT_KIND: docker
    ports:
      - "127.0.0.1:${UNICORE_PORT:-3000}:3000"
    volumes:
      - app_data:/data
    depends_on:
      db:
        condition: service_healthy
    read_only: true
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    restart: unless-stopped
    stop_grace_period: 15s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: unicore
      POSTGRES_USER: unicore
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U unicore -d unicore"]
      interval: 5s
      timeout: 5s
      retries: 20
    restart: unless-stopped
    stop_grace_period: 30s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
volumes:
  app_data:
    name: unicore_data
  postgres_data:
    name: unicore_postgres_data
```

上例数据库不向宿主机发布端口，应用通过内部服务名 `db:5432` 访问。PostgreSQL 镜像中的 `POSTGRES_USER` 是此数据库容器的初始化管理员，只应用于这一实例独占的容器；共享/托管数据库请按第 2 节建立专用受限账号。多实例部署须改容器、端口和卷名，不能共用这些数据卷。

### 4.3 校验、启动、读取凭据

```sh
docker compose config --quiet
docker compose up -d
docker compose ps
docker compose logs --tail 100 app db
curl -fsS http://127.0.0.1:3000/api/v1/health/live

umask 077
unicore_token_dir=$(mktemp -d)
docker compose cp app:/data/bootstrap.token "$unicore_token_dir/bootstrap.token"
cat "$unicore_token_dir/bootstrap.token"
rm -f "$unicore_token_dir/bootstrap.token"
rmdir "$unicore_token_dir"
```

安装时选 PostgreSQL，主机 `db`、端口 `5432`、数据库/用户名 `unicore`、密码为 `.env` 中的值、TLS 关闭（本例 PostgreSQL 未配置 TLS，网络只供同一主机容器使用）。如需跨主机/不可信网络，先配置数据库 TLS 和访问策略再安装。

所有 Compose 命令在该目录执行，或明确 `--env-file /opt/unicore-compose/.env -f /opt/unicore-compose/compose.yaml`。`.env` 不会覆盖已存在的宿主 shell 同名变量；排查配置时注意当前终端是否留有旧的导出值。使用 `config --quiet` 检查语法，不将会展开密码的完整 `config` 输出贴到公开日志。

```sh
docker compose restart app
docker compose stop app
docker compose start app
docker compose down
# 下次 up -d 会重新使用原数据卷；不要加 -v。
```

更改 `.env` 中的数据库密码不会自动修改已初始化数据库的密码。修改数据库密码须在数据库端执行，再同步应用连接配置；不能以删卷方式“应用配置”。应用首次连接信息由安装向导持久化，不靠 `POSTGRES_*` 环境重新覆盖。

源码仓库自带的 `deploy/docker/compose.yaml` 是另一种“从源码构建 app + 外部数据库/SQLite”的方案，不包含 PostgreSQL 服务。使用它时在仓库根执行 `export UNICORE_VERSION="$(cat VERSION)" UNICORE_IMAGE="unicore:$(cat VERSION)"`，再执行 `make compose-up`；之后包括 `cp`/`logs` 在内的 `docker compose -f deploy/docker/compose.yaml ...` 仍需这些变量。不要将两份 Compose 的命令、卷或数据库服务名混用。

## 5. tar + systemd 部署

### 5.1 下载、校验并解压完整包

在自己的下载目录执行。`UNICORE_VERSION`、`UNICORE_ARCH` 和形态必须与实际 Release 资产一致：

```sh
UNICORE_VERSION=0.1.2
UNICORE_ARCH=amd64
UNICORE_PROFILE=web-platform
UNICORE_PACKAGE="unicore-${UNICORE_PROFILE}-linux-${UNICORE_ARCH}-v${UNICORE_VERSION}"
UNICORE_RELEASE="https://github.com/yunnuo88520/Unicore/releases/download/v${UNICORE_VERSION}"
curl -fLO "$UNICORE_RELEASE/$UNICORE_PACKAGE.tar.gz"
curl -fLO "$UNICORE_RELEASE/checksums.txt"
# 此处只选当前包的校验项，避免要求同时下载全部架构。
awk -v file="$UNICORE_PACKAGE.tar.gz" '$2 == file {print}' checksums.txt > selected-checksum.txt
test -s selected-checksum.txt && sha256sum -c selected-checksum.txt
```

只有校验通过才继续；摘要只验证文件与发布记录一致，来源和签名仍需按发行说明核对。无 Release 资产时，可在开发机运行 `make package RELEASE_TARGETS=linux/amd64 RELEASE_PROFILES=web-platform`，传输 `build/releases/` 中的包与校验和；目标机无需构建工具。完整包只有 `unicore` 一个程序入口，以及安装说明、许可证、VERSION/manifest.json 和部署模板；前端已内嵌，不需要 docs/、web/ 或独立帮助/维护工具。保留升级元数据。

```sh
# 版本目录应为新空目录，不能覆盖正在运行的版本。
sudo install -d -m 755 /opt/unicore/releases
sudo mkdir "/opt/unicore/releases/$UNICORE_VERSION"
sudo tar -xzf "$UNICORE_PACKAGE.tar.gz" \
  -C "/opt/unicore/releases/$UNICORE_VERSION" --strip-components=1
sudo ln -s "/opt/unicore/releases/$UNICORE_VERSION" /opt/unicore/current
/opt/unicore/current/unicore help
```

首次创建 `current` 用普通 `ln -s`，存在时先检查是否为已有部署。不要用首次安装命令覆盖在用实例。平台/单机包分别编译默认 profile；若显式设置 `APP_PROFILE`，须与计划安装的形态一致。

### 使用内置服务管理（推荐简化部署）

Linux/systemd 可直接由程序生成匹配实际路径的服务，不必照抄 `/var/lib/unicore`。以下操作在解压目录执行；默认数据为该工作目录的 `data/`，也可在配置中指定外部私有目录：

```sh
./unicore config generate
# 按需要编辑 config.yaml 的 listen、data_dir 等启动配置
sudo ./unicore service install --config config.yaml
unicore help
sudo unicore service status
sudo unicore manage
```

默认生成 systemd unit、启动配置与绑定记录；启用开机自启并立即启动，随后访问 `/install` 完成数据库与管理员安装。`service install --now=false` 只安装不启动，`--enable=false` 不启用自启，`--link=false` 不创建 `/usr/local/bin/unicore` 命令链接。命令链接不覆盖已有其他程序；不需要额外帮助/启动脚本。root 通过 sudo 调用时默认使用原 sudo 用户运行服务；直接以 root 调用时默认创建无登录的 `unicore` 服务账号，也可 `--run-as NAME` 使用已有账号。程序检查该账号对工作目录、可执行文件和数据目录的访问权限；不会递归改已有数据所有者。在 `/root` 下解压的程序通常不允许普通服务账号访问，应先放到可访问的安装目录。

生成服务使用安装时的绝对程序路径与工作目录，`Restart=always` 提供异常退出重启，日志进入 journal。使用 `current` 版本链接部署时，应从 `/opt/unicore/current/unicore` 调用，保持后续版本切换入口稳定。默认数据目录不是强制 `/var/lib/unicore`；下面手动部署章节只是传统目录布局的另一种方式，**不要对同一服务重复安装两套 unit**。已有手工 unit 不会被内置安装覆盖，内置卸载也不会删除它。

```sh
sudo unicore start
sudo unicore stop
sudo unicore restart
sudo unicore logs --lines 100 --follow
sudo unicore service disable  # 只关自启，不停当前进程
sudo unicore service enable
sudo unicore service uninstall  # 停止并移除受管服务，保留用户数据
```

普通 Linux 用户可用 `./unicore service install --user --config config.yaml` 安装用户服务；后续命令都加 `--user`。命令链接为 `~/.local/bin/unicore`，需确保该目录在 PATH。用户服务默认随用户管理器启动；若需要未登录时运行/开机启动，由系统管理员按策略执行 `loginctl enable-linger USER`。不能把用户服务的 enable 等同于已配置系统级开机自启。

Windows/macOS 保留前台启动，不提供 systemd/Windows Service/launchd 安装。Docker 使用宿主机 `docker start/stop/restart` 或 Compose 与 restart policy，容器内不安装 systemd、不挂载 Docker socket。账号恢复等离线命令仍需要停止容器，并通过保留原数据挂载和密钥的同版本临时工具容器执行；不能向正在运行的实例并发写入。

后台路径、忘记管理员密码、维护模式与数据库连接恢复命令见 [配置与管理命令](configuration.md#web-管理命令)。

### 5.2 服务用户和私有数据

```sh
# 用户已存在时先核对其用途，无需重复创建。
sudo useradd --system --user-group --home-dir /var/lib/unicore \
  --shell /usr/sbin/nologin unicore
sudo install -d -m 700 -o unicore -g unicore /var/lib/unicore
sudo install -d -m 750 -o root -g unicore /etc/unicore
```

程序目录默认由 root 管理、服务用户只读；数据目录由 `unicore` 写入。不把私有目录放在 Nginx root/web 目录下。

可选创建 `/etc/unicore/unicore.env`（`sudoedit` 后 `sudo chmod 600 /etc/unicore/unicore.env`）：

```dotenv
APP_PROFILE=web-platform
APP_LOG_LEVEL=info
APP_LOG_FORMAT=json
APP_API_DOCS=false
```

这是 systemd 的 `EnvironmentFile` 格式，写 `KEY=value`，不写 `export`、shell 命令或 `$()`。`APP_SECRET_KEY`/安装 token 通常无需手动配置，让程序生成私有文件即可。更多参数及可选 YAML/JSON 配置见 [配置说明](configuration.md)。

### 5.3 安装 unicore.service

发行包已提供 `deploy/unicore.service`；路径采用本文默认目录时可以直接复制：

```sh
sudo cp /opt/unicore/current/deploy/unicore.service /etc/systemd/system/unicore.service
```

下面为模板的完整内容，使用其他产品名/目录时同步修改 `User`、`Group`、`WorkingDirectory`、`ExecStart`、`APP_DATA_DIR` 和 `ReadWritePaths`：

```ini
# Author: yunnuo <ymz@ebox.vip>
[Unit]
Description=Unicore application server
After=network.target

[Service]
User=unicore
Group=unicore
WorkingDirectory=/var/lib/unicore
Environment=APP_DEPLOYMENT_KIND=tar
Environment=APP_LISTEN=127.0.0.1:3000
Environment=APP_DATA_DIR=/var/lib/unicore
Environment=APP_UPDATE_RESTART=supervisor
EnvironmentFile=-/etc/unicore/unicore.env
ExecStart=/opt/unicore/current/unicore
Restart=always
KillMode=process
RestartSec=3
TimeoutStopSec=15
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/unicore
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

`EnvironmentFile=-...` 允许没有 env 文件时启动；存在时其中的值覆盖 unit 中同名 `Environment=` 值。`ProtectSystem=strict` 默认不允许程序改写安装目录；本文采用人工停服更新，未开启 tar OTA 写权限。

```sh
sudo systemd-analyze verify /etc/systemd/system/unicore.service
sudo systemctl daemon-reload
sudo systemctl enable --now unicore.service
sudo systemctl status unicore.service --no-pager
sudo journalctl -u unicore.service -n 100 --no-pager
curl -fsS http://127.0.0.1:3000/api/v1/health/live
sudo -u unicore cat /var/lib/unicore/bootstrap.token
```

此时 `live` 应为 200，未安装时 `ready` 为 503 属于正常状态。配置/环境更改后执行 `sudo systemctl restart unicore`；修改 unit 还需先 `daemon-reload`。`journalctl -u unicore -f` 可持续查看日志。

## 6. 配置 HTTPS、Nginx 或宝塔

### 平台公网入口

先把自己的域名解析到服务器并准备可读的完整证书链/私钥。以下示例中的 `app.example.com` 和 `/etc/letsencrypt/live/app.example.com/` 都须替换。证书可通过 ACME 客户端或宝塔面板签发，并配置自动续期与续期后的 Nginx reload；本文不假设证书已随程序提供。

tar、Docker 和 Compose 的默认宿主机 Nginx 上游均为 `127.0.0.1:3000`。如果自定义监听或映射端口，需要同步修改所有 `proxy_pass`。所有页面交给 Go 路由，无需给 Nginx 开放 `/var/lib/unicore` 或容器卷。

```nginx
# Author: yunnuo <ymz@ebox.vip>
server {
    listen 80;
    server_name app.example.com;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    server_name app.example.com;
    ssl_certificate /etc/letsencrypt/live/app.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 2m;

    location ~ ^/api/v1/(admin/)?files/multipart/[^/]+/parts/[0-9]+$ {
        client_max_body_size 64m;
        proxy_request_buffering off;
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
    location ~ ^/api/v1/(admin/)?files/multipart/[^/]+/complete$ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 7200s;
    }
    location ~ ^/api/v1/(admin/)?files/uploads/[^/]+/content$ {
        client_max_body_size 1024m;
        proxy_request_buffering off;
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
    }
}
```

分片接口独立放大请求上限，站点通用 JSON 请求仍为 2 MiB；应用自己的策略还会限制文件总大小。代理/CDN 也应允许相应请求体与完成合并时长，不能只增大 Nginx 一处。旧版整文件上传上限示例为 1 GiB，不代表当前产品的文件策略上限或性能承诺。

Ubuntu/Debian 可以把配置保存到 `/etc/nginx/sites-available/unicore.conf`，然后：

```sh
sudo ln -s /etc/nginx/sites-available/unicore.conf /etc/nginx/sites-enabled/unicore.conf
sudo nginx -t
sudo systemctl reload nginx
curl -fsS https://app.example.com/api/v1/health/live
```

服务器有其他站点时先确认端口和 `server_name` 不冲突；使用系统的 `conf.d` 布局则直接放入其已 include 的目录。证书尚不存在时不要加载引用它的 HTTPS 配置，先完成签发流程。

宝塔中创建自己的域名站点并申请证书，在该站点 server 块内合并上述反代 location，调整上游端口；不要额外添加会抢先返回 `index.html` 的 SPA 伪静态。使用面板的 Nginx 配置检测/重载。tar 包内另有 `deploy/nginx.conf.example`，与容器方案一样统一反代；前端静态资源由程序内嵌提供，无需 Nginx 文件根目录。

偏好 Caddy 时等价配置更短（自动 HTTPS，证书与续期内置）：

```caddyfile
app.example.com {
    reverse_proxy 127.0.0.1:3000
    request_body {
        max_size 64m
    }
}
```

通用 JSON 请求的应用侧上限仍为 2 MiB，分片路径按上文 Nginx 一节同样的思路放宽；`request_body` 只需覆盖最大分片体积，应用策略继续约束文件总大小。

安装前固定最终域名和 HTTPS。安装 origin 会用于 Secure Cookie 和 OIDC 回调；只在后台修改“站点地址”不会改变这两个边界。反代需保留外部 Host 和协议，推荐根域部署，不把改后台路径当子路径托管。Go 当前记录真实 socket IP，不信任 `X-Forwarded-For` 作为客户端地址，反代后设备页 IP 可能是代理地址。

### 单机或暂未准备域名

本机直接访问回环地址即可。服务器上的临时试用可以从自己电脑建立隧道（自定义端口时对应调整）：

```sh
ssh -L 3000:127.0.0.1:3000 your-ssh-user@your-server
```

浏览器访问 `http://127.0.0.1:3000/install`。平台如果计划随后迁到公网域名，建议先准备最终 HTTPS 地址再安装；不要假设换 Nginx 域名即可同步已保存的安装 origin。

## 7. 首次安装：从打开页面到可以登录

1. 在最终访问入口打开 `/install`；未安装时访问首页也会进入向导。
2. 输入从私有文件读取的 `bootstrap.token`。它证明你拥有服务器，与数据库密码、管理员密码、`secret.key` 不同。
3. 选择 `web-platform` 或 `web-standalone`。检查启动时 `APP_PROFILE` 与发行包默认形态是否符合计划；已有安装不能通过改变量转换形态。
4. 填写数据库。向导默认 MySQL，使用 PostgreSQL 或 SQLite 时显式切换；对照第 2 节填写连接信息。
5. 点击“测试连接”，成功后继续。连接字段变化需要重测；测试不会执行清空/迁移（SQLite 可能创建空文件）。不要勾选清空未知非空库；首次部署优先新空库。
6. 填写站点名称；平台版创建首个管理员，使用自己的邮箱和强密码（至少 12 字符）。没有内置可用于生产的默认账号；单机版没有管理员步骤。站点访问地址由当前浏览器 origin 自动记录。
7. 核对形态、数据库和操作影响，确认完成。成功后生成 `install.lock`、吊销并删除安装 token。完成页的用户/管理入口可以直接点击。
8. 平台版后台默认 `/admin`，普通用户入口 `/login`；分别管理两种身份，同名邮箱不会自动合并。单机版直接进入工作台。
9. 按第 8 节配置并验证，再开放给用户。不要将安装 token 留在共享终端、工单或截图中。

正常重启/替换程序会恢复原安装。完成后访问 `/install` 不应重新出现可安装向导，安装写接口返回 409。需要明确清空重装时见本文末尾，不能通过删目录来“修复启动”。

## 8. 安装后配置和检查

平台管理员在“系统管理 → 系统设置”配置；个人资料、验证器和登录设备在“个人中心”。单机没有全局管理页，只有本机外观设置。

| 项目 | 操作与通过标准 |
| --- | --- |
| 站点地址 | 基础设置填写最终外部 URL，用来生成邮件链接；不带子路径、query 或 fragment。安装 origin 的作用不同，详见配置说明 |
| 管理员邮箱/备案/页脚 | 基础设置填写，确认前台展示；管理员邮箱是通知接收地址配置，不会改变账号登录邮箱，也不自动连接外部告警系统 |
| 邮件 | 邮件设置保存 SMTP、发送测试邮件并确认收到，再启用注册邮箱验证、邮箱验证码登录或找回密码 |
| 账户安全 | 在独立二级菜单配置失败封禁、空闲超时和按实际管理权限区分的强制 2FA；先实测管理员绑定、恢复码与用户登录 |
| 注册 | 默认关闭。在注册设置独立配置开放注册与邮箱验证；关闭验证时直接注册，无需 SMTP，开启验证时先完成 SMTP 测试。配置后实际测试新账号注册和登录；关闭注册时入口和 API 均拒绝 |
| 双重验证 | 个人中心设置验证器并保存恢复码；开启强制策略前确认管理员已具备可用验证方式和恢复码 |
| 维护模式 | 默认关闭。启用后普通用户受维护提示限制，管理员仍可进入后台关闭；计划停服时仍需真实停止进程 |
| 文件 | 上传小文件、下载并校验权限；切换云位置前先测试连接，按需设置全局默认策略与迁移 |
| 企业登录 | 配置 IdP 和两个固定回调，分别验证用户/管理员登录；相同邮箱不自动绑定 |

```sh
# 三种部署默认均用 3000；自定义端口时调整。公网再用最终域名检查一次。
curl -fsS http://127.0.0.1:3000/api/v1/health/live
curl -fsS http://127.0.0.1:3000/api/v1/health/ready
curl -fsS https://app.example.com/api/v1/health/ready
```

`live=200` 只表示进程可响应；`ready=200` 要求已安装且数据库可连接。安装前 `ready=503` 正常，安装后持续 503 应检查数据库/实例状态。再做一次真实登录、业务读写和上传测试；仅健康接口通过不足以证明配置完整。

重启应用后复查 ready、原账号、设置和文件是否保留。数据量、内存、磁盘和日志增长按实际负载监控；`APP_MONITOR_LISTEN=127.0.0.1:9090` 的独立指标仅给受控本机采集，容器内没有宿主可见的回环指标端口。

### 日志与监控接入

- tar/systemd：日志进 journald，`sudo journalctl -u unicore -f --output=json` 可持续采集；JSON 行包含 request_id、route、status 与耗时。
- Docker/Compose：`docker logs`/`docker compose logs`，Compose 示例已配置 json-file 轮转（10 MiB × 3）。
- 指标：设置 `APP_MONITOR_LISTEN`（默认关闭，只接受字面回环地址）后在 `/metrics` 抓取 Prometheus 文本格式：HTTP 请求计数、状态分布与时延直方图，外加数据库连接池指标；只对本机/私网采集器开放，不要暴露公网。应用指标不替代业务侧监控与告警。

### 单实例边界

当前产品按**单实例**设计与验收：一个应用进程连接一个数据库，水平扩容（多副本共享一库）不在已验证范围内，会话、限流与后台任务都以单进程为前提。需要更高容量时先垂直扩容或读写分离评估，不要自行多副本部署后默认其受支持；水平扩容属于未验证范围，见文档站"支持范围与已知限制"。

## 9. 更新、备份与回退

### 先停写并成套备份

tar 停 `sudo systemctl stop unicore`；Docker 命令用 `docker stop unicore`；本文 Compose 用 `docker compose stop app`（保留 db 运行以便原生客户端导出）。维护模式不能替代停进程。使用匹配版本 `./unicore backup|verify|restore`，完整步骤、外部数据库客户端与云对象要求见 [备份与恢复](backup.md)。

保存数据库、完整私有目录/密钥、部署配置、原程序/镜像版本及校验和。备份落在独立受控目录并做恢复演练。Docker 镜像内没有 ops/数据库客户端；在宿主机或专用运维环境执行，不能对运行中的数据库卷直接打 tar 当作一致备份。

### tar 人工更新

下载并校验新完整包，解压到新的版本目录，停服和备份后将 `current` 链接切到新目录，再启动检查：

```sh
# 已事先解压并核对新版本，以下路径按实际调整。
sudo systemctl stop unicore
# 此处先完成备份，再继续。
sudo ln -sfn /opt/unicore/releases/NEW_VERSION /opt/unicore/current
sudo systemctl start unicore
sudo journalctl -u unicore -n 100 --no-pager
curl -fsS http://127.0.0.1:3000/api/v1/health/ready
```

不覆盖 `/var/lib/unicore`。数据库迁移只在正常启动边界执行；失败停止排查，不删除账本或手改 checksum。tar 可信 OTA 是额外配置，不在默认 systemd 模板中开放安装目录写权限；签名、staging 和 supervisor 条件见 [更新说明](updates.md)。

### Docker 外部替换

在停服和备份后，保留卷，替换为已核验的新镜像。本文 Compose 修改 `.env` 中的 `UNICORE_IMAGE`，若使用可信注册表镜像先 `docker compose pull app`，本地构建则确保该镜像已存在，再执行：

```sh
docker compose up -d --no-deps --force-recreate app
docker compose logs --tail 100 app
curl -fsS http://127.0.0.1:3000/api/v1/health/ready
```

`docker restart` 不会应用新镜像。Docker 命令方式停止并删除旧容器（`docker rm unicore`），再用 3.2 相同参数和原 `unicore_data` 卷、新镜像创建容器。不使用 `docker volume rm` 或 `compose down -v`；不向应用挂载 Docker socket，也不在容器内覆盖二进制。

### 回退与迁机

若新版本改过数据库结构，只切回旧程序可能无法运行。使用匹配的旧程序/镜像、旧数据库快照、同一时点的完整私有目录和密钥恢复到新目标，再验证切流，避免新旧实例同时写同一数据。恢复旧快照也可能恢复旧会话/恢复码消费状态，按敏感凭据保护备份。

## 10. 故障排查与明确重装

| 现象 | 优先检查 |
| --- | --- |
| 页面连接拒绝/502 | `systemctl status`/`docker compose ps`、应用日志、监听端口、Nginx 上游；容器监听应为 `0.0.0.0:3000`，宿主端口为 3000 |
| 目录 permission denied | tar 的服务用户与 `/var/lib/unicore` 权限；容器挂载目录 UID/GID 65532、只读根下 `/data` 是否独立可写 |
| Docker 无法执行 cat/sh | distroless 无 shell，使用 `docker cp`/`docker compose cp`，宿主机 `curl` |
| 找不到 bootstrap.token | 安装成功后会删除；先检查是否已经安装、是否读取正确数据目录/卷，不重新建目录 |
| 数据库连接失败 | 驱动、服务名、端口、账号来源限制、DB 监听/ACL；容器内不要误填 127.0.0.1；有无误开 TLS |
| 安装后 ready=503/启动退出 | DB Ping、安装标记与实例是否匹配、密钥是否完整；日志中保留 request ID，不能删标记强行初始化 |
| 上传 413/超时 | Nginx/CDN 的分片路径体积/超时、旧整文件上传规则、应用文件策略和可用磁盘 |
| 邮件链接域名错误/不能登录 | 邮件用站点地址；Cookie/OIDC 依赖安装 origin；核对 HTTPS、Host、回调地址和浏览器访问入口 |
| 改 `.env` 后无效 | Compose 变量优先级、是否重建 app、已持久化 DB 密码不会被环境自动重置 |
| 重启后又见安装页 | 指向了新数据目录/卷或根本没持久化；找回原目录/密钥，不在空向导中覆盖原库 |

从头安装是删除所选数据库业务数据的操作，普通更新不需要做。确需重装时：停服务 → 完整备份 → **仅删除私有目录的 `install.lock`** → 重启 → 读取新生成的 `bootstrap.token`。不要删除 `installation.json`、`secret.key` 或手改迁移账本。运行时删锁不会开放向导。

原站数据库只有在原连接及实例归属验证通过后，才能明确勾选清空并精确输入库名；其他实例或归属不明的非空库不能覆盖。也可另建新空库保留旧库。MySQL 清空中断可能留下部分改动，不能承诺自动恢复，优先恢复备份或改用新空目标。

返回 [使用指南](index.md)；参数见 [配置说明](configuration.md)，文件配置见 [存储指南](storage.md)。
