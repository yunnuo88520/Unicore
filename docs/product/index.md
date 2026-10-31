<!-- Author: yunnuo <ymz@ebox.vip> -->
# Unicore 使用指南

Unicore 以 Go + React + TypeScript 共享核心业务，提供 Web 在线平台、Web 单机、Wails 桌面和 CLI。当前为开发预览，不能将构建成功等同于目标系统运行或生产升级验证。

| 形态 | 适用场景 | 数据库与身份 |
| --- | --- | --- |
| web-platform | 在线多用户应用 | SQLite / PostgreSQL / MySQL；管理员与用户独立登录 |
| web-standalone | 本机 Web 应用 | 三种数据库；无平台账号，不对公网开放 |
| desktop | 原生本地应用 | SQLite；无平台账号 |
| cli | 命令行调用共享核心 | 无数据库、HTTP 或平台身份依赖 |

## 源码开发

准备 Go 1.26.10+、满足 package.json engines 的 Node、pnpm 11.25.0、Git 和 ripgrep。桌面还需要本系统 Wails 原生依赖。运行 make doctor 检查环境。

```sh
make install
make dev-server
# 另一个终端
make dev-web
```

Web 首次访问 /install。在线生产环境推荐 MySQL 或 PostgreSQL；向导支持测试连接。安装前确认是自己授权的专用数据库：安装可能初始化该目标的数据，不能把生产/未知数据库用于试装。一次性安装凭据来自私有数据目录 bootstrap.token，用于保护首次安装，不是数据库密码或应用加密密钥。安装配置与标记须持久化；正常重启不应重复安装。

管理员从 /admin（可配置）登录，用户从 /login 登录，两种身份分别校验。演示实例才使用 admin / Admin@123456，实际部署自行设置密码，不内置业务账号。单机与桌面不提供平台管理端。

macOS 桌面推荐下载 DMG 并拖入 Applications；Windows 桌面直接运行 EXE，Linux 桌面解压 tar。Web tar 解压后用 ./unicorehelp、./unicore config generate、./unicore --config unicore.json；配置可选，首次安装仍访问 /install。CLI tar 中运行 bin/unicore；源码下的开发命令与发行二进制路径不同。先阅读 [配置](configuration.md)、[构建](build.md) 和 [部署](deployment.md)。

## 按任务阅读

- [配置与监控](configuration.md)
- [Web / Desktop / CLI 构建](build.md)
- [Nginx、tar 与 Docker 部署](deployment.md)
- [备份与恢复](backup.md)
- [文件与对象存储](storage.md)
- [更新渠道与安全升级](updates.md)

若首次启动失败，先检查目录权限、端口、数据库连接与日志；保留原数据目录，不删除安装标记或迁移账本来重试。跨版本升级先备份并在隔离副本验证；没有实测的 OS/数据库/升级起点不应推定可用。
