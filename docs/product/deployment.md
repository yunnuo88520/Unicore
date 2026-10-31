<!-- Author: yunnuo <ymz@ebox.vip> -->
# tar、Nginx 与 Docker 部署

先核对发行包来源、校验和、版本/平台和功能开关；数据与密钥放在包目录之外。线上平台使用 HTTPS，推荐专用 PostgreSQL/MySQL。单机模式只供本机，不能当作无需登录的公网服务。

## tar / 宝塔 / Nginx

解压完整归档到版本目录，采用 deploy/tar/nginx.conf.example 和 unicore.service 作为配置起点，按实际路径、域名、服务用户和权限调整。安装向导需访问 /install，并读取私有 APP_DATA_DIR 中 bootstrap.token。完成安装后保留整个数据目录，重启/替换程序不应重新安装。

```sh
APP_DEPLOYMENT_KIND=tar APP_DATA_DIR=/var/lib/my-app APP_LISTEN=127.0.0.1:8080 /opt/my-app/current/bin/server
```

Nginx 反代到回环服务，配置正确 Host、HTTPS 与上传体积/超时；client_max_body_size 必须覆盖应用允许的大小。路径部署与后台入口需按应用实际路由验证，不把 /admin 改名当作权限保护。静态资源与 API 来自相同发行版本。

默认 systemd 模板不允许应用改写安装目录。仅在明确启用可信 OTA 时，额外配置安装根、同文件系统 staging、受限服务用户写权限和 supervisor 重启。不要扩大整个文件系统写权限。

## Docker / Compose

源码中 make docker-build 只构建本地镜像，make compose-up 使用 VERSION 启动。需要外部注册表时自行选择可信仓库和固定版本/digest，框架不承诺某个公共镜像已经存在。不要向应用容器挂 Docker socket。

持久化 /data，确保 nonroot 用户拥有目录；数据库服务独立持久化。备份数据库、私有文件与密钥后才能替换容器。容器更新由宿主机拉取/切换镜像，应用内不能覆盖自身二进制。相同数据卷的同版本替换不等于跨版本迁移恢复验证。

部署后检查 /api/v1/health/ready、登录与权限、附件和邮件配置。配置服务重启策略与受控日志/监控；API 文档和监控按需开放，不使用真实邮箱/数据库测试不确定变更。

## 升级和回退

停服并备份，在隔离副本验证目标版本与数据库兼容。新结构可能与旧程序不兼容；回退必须恢复对应二进制、数据库、私有文件和密钥，不能只换旧 binary。数据库失败后不删除账本、不改 checksum、不自动 DROP/reset。未知/不支持的升级路径先停止，不按其他数据库结果推断成功。

操作参考 [备份](backup.md)、[更新](updates.md)、[存储](storage.md) 与 [配置](configuration.md)。
