<!-- Author: yunnuo <ymz@ebox.vip> -->
# 使用指南

Unicore 面向需要二次开发的 Go + React + TypeScript 项目。产品分为 Platform、Standalone、CLI 三种；Standalone 有 Web 和 Wails 桌面两个载体，共四个装配 profile。当前为开发预览，不能将构建成功等同于目标系统运行或生产升级验证。

| 形态 | 适用场景 | 数据库与身份 |
| --- | --- | --- |
| web-platform | 在线多用户应用 | SQLite / PostgreSQL / MySQL；统一账号、多角色、共享会话，两个工作台入口 |
| web-standalone | 本机 Web 应用 | 三种数据库；无平台账号，不对公网开放 |
| desktop | 原生本地应用 | SQLite；无平台账号 |
| cli | 命令行调用共享核心 | 无数据库、HTTP 或平台身份依赖 |

## 第一次体验（推荐 SQLite）

开发者先按 [创建自己的应用](development.md) 导出项目并执行 make install。只体验参考应用也可在源码仓库运行下列命令；不需要准备外部数据库。

```sh
make dev-server
# 第二个终端，在同一项目目录运行
make dev-web
```

打开终端显示的前端地址（默认 http://127.0.0.1:5173），进入 /install，从私有 data/bootstrap.token 读取一次性凭据，选择 Platform 和 SQLite，填写自己的站点与管理员资料。安装完成后打开“我的笔记”，新建一条笔记，刷新页面确认仍在；停止两个开发进程并重新启动，再确认内容保留。保留完整 data 目录，不重复执行安装或删除账本。

接着完成 [第一个功能](first-feature.md)。生产部署和数据库选择再读下面的详细手册；CLI 的 execute 是独立无状态文本分析，不读取这条笔记。

## 直接部署与安装

不改源码的 Web 用户从 [Web 从零部署指南](deployment.md) 开始：环境要求、数据库准备、Docker 命令、完整 Compose、tar/systemd、Nginx/HTTPS、首次安装与更新排查均按步骤给出。运行已构建 Web 包/镜像不需要在服务器安装 Go/Node。所有 flags、环境变量、JSON 和后台设置表见 [配置说明](configuration.md)。

桌面用户下载对应系统安装包直接运行；CLI 解压后执行 `./unicore version` 或 `./unicore execute --text "Hello Unicore"`，都不需要 Web 部署。

## 源码开发

准备 Go 1.26.11+、满足 package.json engines 的 Node、pnpm 11.25.0、Git 和 ripgrep。桌面还需要本系统 Wails 原生依赖。运行 make doctor 检查环境。

```sh
make install
make dev-server
# 另一个终端
make dev-web
```

Web 首次访问 /install。在线生产环境推荐 MySQL 或 PostgreSQL；向导支持测试连接。安装前确认是自己授权的专用数据库：安装可能初始化该目标的数据，不能把生产/未知数据库用于试装。一次性安装凭据来自私有数据目录 bootstrap.token，用于保护首次安装，不是数据库密码或应用加密密钥。安装配置与标记须持久化；正常重启不应重复安装。

管理工作台从 /admin（可配置）进入，用户工作台从 /login 进入，两者共用账号与会话；是否可管理由服务端权限判断。安装时设置自己的管理员账号和密码，框架不内置业务账号。单机与桌面不提供平台管理端。

macOS 桌面推荐下载 DMG 并拖入 Applications；Windows 桌面直接运行 EXE，Linux 桌面解压 tar。Web tar 解压后用 ./unicore help、./unicore config generate、./unicore --config config.yaml；配置可选，首次安装仍访问 /install。CLI tar 中运行 ./unicore；源码下的开发命令与发行二进制路径不同。先阅读 [配置](configuration.md)、[构建](build.md) 和 [部署](deployment.md)。

## 按任务阅读

- [配置与监控](configuration.md)
- [Web / Desktop / CLI 构建](build.md)
- [Web 从零部署](deployment.md)
- [备份与恢复](backup.md)
- [文件与对象存储](storage.md)
- [更新渠道与安全升级](updates.md)

若首次启动失败，先检查目录权限、端口、数据库连接与日志；保留原数据目录，不删除安装标记或迁移账本来重试。跨版本升级先备份并在隔离副本验证；没有实测的 OS/数据库/升级起点不应推定可用。
