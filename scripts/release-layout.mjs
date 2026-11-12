// Author: yunnuo <ymz@ebox.vip>
// Description: Explicit minimal user archive layouts and profile-specific installation instructions.
import assert from 'node:assert/strict';
import { inventory } from './distribution.mjs';

export function releaseFiles({profile, os, identity, binary}) {
  const common = ['LICENSE', 'README.md', 'VERSION', 'manifest.json'];
  if (profile === 'desktop') return [...common, binary].sort();
  const executable = identity.cli.command + (os === 'windows' ? '.exe' : '');
  if (profile === 'cli') return [...common, executable].sort();
  if (!['web-platform', 'web-standalone'].includes(profile)) throw Error('Unknown release profile');
  return [...common, executable, `deploy/${identity.deployment.serviceName}.service`, 'deploy/nginx.conf.example'].sort();
}

export function checkReleaseLayout(directory, options) {
  const files = inventory(directory);
  const expected = releaseFiles(options);
  // A native macOS bundle contains its own framework/resources; only that bundle is recursive.
  const actual = options.os === 'darwin' && options.profile === 'desktop'
    ? [...new Set(files.map(file => file.startsWith(options.binary + '/') ? options.binary : file))].sort()
    : files;
  assert.deepEqual(actual, expected, 'User archive contains missing or unexpected files');
}

export function installationReadme({identity, profile, os, arch, version}) {
  const command = `./${identity.cli.command}${os === 'windows' ? '.exe' : ''}`;
  const heading = `<!-- Author: yunnuo <ymz@ebox.vip> -->\n# ${identity.product.name} ${version}\n\n${profile} · ${os}/${arch}\n`;
  const links = '\n完整说明 / Full documentation: https://unicore.ebox.vip\n\n发行状态与系统签名以对应 Release 和 manifest 为准；SHA-256 不替代发行者签名。升级前成套备份数据库、私有数据与密钥。\nSee the matching Release and manifest for release status and OS signatures; checksums do not replace publisher signatures. Back up the database, private data and keys together before upgrading.\n';
  if (profile === 'cli') return heading + `
## 使用 / Usage

无需 Web、数据库或额外运行时。解压后在终端执行（Windows PowerShell 用 .\\${identity.cli.command}.exe）：
No Web server, database or extra runtime is required. Extract and run in a terminal (Windows PowerShell: .\\${identity.cli.command}.exe):

\`\`\`sh
${command} --help
${command} version
${command} execute --text "Hello ${identity.product.name}"
\`\`\`
` + links;
  return heading + `
## 环境 / Requirements

Linux ${arch}，可用 TCP 端口。SQLite 已内置；PostgreSQL/MySQL 需自行准备服务。使用 HTTPS/外部服务需要系统 CA 证书与 DNS。无需 Node、Go 或单独部署前端。
Linux ${arch}, an available TCP port, system CA certificates and DNS for HTTPS/external services. SQLite is built in; PostgreSQL/MySQL require a separate database server. No Node, Go or separate frontend is needed.

## 首次启动 / First run

在解压目录中执行，建议将私有数据目录放在包目录之外，避免升级时覆盖：
Run from the extracted directory; keep private data outside the release to avoid overwriting it during upgrades:

\`\`\`sh
${command} help
${command} version
${command} config generate --output ../config.yaml
APP_DATA_DIR="$HOME/.local/share/${identity.product.slug}" ${command} --listen 127.0.0.1:3000
\`\`\`

配置文件可选；指定 --config ../config.yaml 才会加载（环境变量和启动参数优先）。
Configuration is optional; load it explicitly with --config ../config.yaml (environment variables and flags take precedence).

访问 http://127.0.0.1:3000/install，读取上述数据目录中的 bootstrap.token，按向导配置数据库${profile === 'web-platform' ? '与管理员' : ''}。远程试用可通过 SSH 隧道访问；公网部署必须配置 HTTPS。
Open http://127.0.0.1:3000/install, read bootstrap.token from that private data directory and complete the database${profile === 'web-platform' ? ' and administrator' : ''} setup. Use an SSH tunnel for remote trials; public deployments require HTTPS.

## 内置管理菜单 / Management menu

默认数据目录为 ./data；安装受管服务后，管理命令自动复用服务配置，无需反复指定 --data-dir。数据目录可按需在 config.yaml 设置。
The default data directory is ./data. Once a managed service is installed, management commands reuse its configuration. Set data_dir in config.yaml when needed.

Linux/systemd 可使用同一个程序安装守护服务、启用自启并创建命令链接：
On Linux/systemd, the same program installs a supervised service, enables autostart and creates a command link:

\`\`\`sh
${command} config generate --output config.yaml
# 检查配置并按需调整 data_dir / Review configuration and data_dir
sudo ${command} service install --config config.yaml
sudo ${identity.cli.command} manage
sudo ${identity.cli.command} start
sudo ${identity.cli.command} stop
sudo ${identity.cli.command} restart
sudo ${identity.cli.command} logs --follow
\`\`\`

已存在 config.yaml 时跳过生成；已有手工服务时先确认用途，不能覆盖安装。菜单提供管理员密码恢复、后台路径、维护模式和数据库连接配置，修改前须停服。不会迁移数据库或清除双因素验证。非 Linux 系统使用前台启动；Docker 在宿主机使用 docker/compose。
Skip generation if config.yaml already exists. Inspect existing manual services before installation. Stop the instance before using offline password recovery, administrator path, maintenance or database connection commands. These commands neither migrate databases nor clear two-factor authentication. Use foreground startup on other systems and host docker/compose commands for containers.

## 手工 systemd / Manual systemd / Nginx

以下命令需要 sudo（将解压目录路径替换为实际路径）：
These commands require sudo (replace the extracted-directory path):

\`\`\`sh
sudo useradd --system --user-group --home ${identity.deployment.dataDirectory} --shell /usr/sbin/nologin ${identity.deployment.serviceUser}
sudo install -d -m 755 ${identity.deployment.installDirectory}
sudo cp -a /path/to/extracted-release ${identity.deployment.installDirectory}/current
sudo install -d -m 700 -o ${identity.deployment.serviceUser} -g ${identity.deployment.serviceUser} ${identity.deployment.dataDirectory}
sudo install -m 644 deploy/${identity.deployment.serviceName}.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ${identity.deployment.serviceName}
sudo systemctl status ${identity.deployment.serviceName}
sudo cat ${identity.deployment.dataDirectory}/bootstrap.token
\`\`\`

如服务用户或 current 已存在，先确认用途再调整，不能覆盖现有实例。deploy/nginx.conf.example 为反代模板；设置域名/TLS 后用 nginx -t 检查再重载。静态资源由程序内嵌提供，不需要 web/ 目录。平台登录默认 /，管理端默认 /admin；单机形态无账号与管理端。
Check existing users/directories before adapting these commands; do not overwrite another instance. Configure your domain and TLS in deploy/nginx.conf.example, validate with nginx -t and reload. Assets are embedded; no web/ directory is needed. Platform login: /; administrator: /admin. Standalone has no accounts or administration.

## 停服备份与升级 / Offline backup and upgrades

同一个可执行文件提供 backup、verify、restore，先查看各命令 --help。备份/恢复需停止实例，并通过 UNICORE_BACKUP_PASSPHRASE 环境变量提供至少 12 字符口令；不要写入口令到命令历史或说明文件。
The same executable provides backup, verify and restore; append --help for options. Stop the instance first and provide a passphrase of at least 12 characters via UNICORE_BACKUP_PASSPHRASE, without storing it in shell history or documentation.

保留 VERSION 与 manifest.json 供升级校验。旧 bin/server 布局首次切换须手动停服、替换整套程序并把 systemd ExecStart 改为 ${identity.deployment.installDirectory}/current/${identity.cli.command}；不要直接覆盖旧目录，不覆盖私有数据。后续 OTA 使用同布局的完整签名发行包。Docker 由外部替换镜像。
Keep VERSION and manifest.json for update validation. Migrating from the old bin/server layout requires a stopped manual replacement of the full release and changing systemd ExecStart to ${identity.deployment.installDirectory}/current/${identity.cli.command}. Do not overlay the old release or overwrite private data. Subsequent OTA uses complete signed archives with the same layout. Replace Docker images externally.
` + links;
}
