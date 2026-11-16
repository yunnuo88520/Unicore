<!-- Author: yunnuo <ymz@ebox.vip> -->
# 快速开始

Unicore 是应用开发框架，个人笔记是可裁剪的业务 demo。开发自己的产品可从 [创建应用](development.md) 和 [功能裁剪](features.md) 开始；本页介绍形态选择与源码试运行。需要直接安装时，阅读 [Web 部署](deployment.md) 或 [桌面与 CLI 安装](install-desktop.md)；要开发自己的产品，阅读 [创建应用](development.md)。

## 选择产品形态

| 形态 | 载体 / profile | 账号与管理 | 数据库 |
| --- | --- | --- | --- |
| Platform | Web / `web-platform` | 统一账号、多角色、用户与管理工作台 | SQLite、PostgreSQL、MySQL |
| Standalone | Web / `web-standalone` | 单用户，无平台账号或管理后台 | SQLite、PostgreSQL、MySQL |
| Standalone | 原生桌面 / `desktop` | 与单机 Web 相同的本地业务 | 自动初始化 SQLite |
| CLI | 命令行 / `cli` | 无界面，直接调用共享 Core | 无自身持久化 |

Web 的形态在安装向导中确定，安装后不能切换。Standalone Web 默认仅监听本机；通过局域网或公网访问时，需要额外配置认证或访问控制。详细支持范围见 [支持与兼容性](https://unicore.ebox.vip/support)。

## 准备环境

安装 Go 1.26.11+、Node.js 22.22.2+、pnpm 11.25.0、Git、Make 和 ripgrep（`rg`）。Node.js 的其他支持版本见根目录 `package.json` 的 `engines`。Windows 开发 Web/CLI 可使用 WSL2；原生桌面开发需在目标系统安装 [Wails 依赖](https://wails.io/docs/gettingstarted/installation)。

```sh
git clone https://github.com/yunnuo88520/Unicore.git
cd Unicore
make install
make doctor
```

## 第一次体验（推荐 SQLite）

在仓库根目录启动后端：

```sh
make dev-server
```

在第二个终端进入同一目录，启动前端：

```sh
make dev-web
```

打开 [http://127.0.0.1:5173](http://127.0.0.1:5173)。如果端口被占用，以 Vite 输出的地址为准。

1. 首次打开会进入 `/install`。读取 `data/bootstrap.token`，将一次性安装凭据填入向导。
2. 选择 **Platform** 和 **SQLite**。SQLite 适合本机试用，不需要外部数据库。
3. 填写站点信息，创建自己的管理员账号和强密码；框架没有预置账号。
4. 完成安装并登录，打开“我的笔记”，创建一条笔记并上传附件。
5. 刷新页面，再停止并重新启动开发进程，确认笔记仍在。

安装会在 `data/` 保存数据库、配置、文件及密钥。保留完整目录，正常重启无需再次安装。一次性安装凭据用于保护向导，与数据库密码和数据加密密钥不同。

::: warning 数据库初始化
试用请使用新建的专用数据库。非空库只有在勾选清空并精确确认库名后才会初始化；其他 Unicore 实例的数据受归属保护。清空会删除目标库的数据，安装前务必核对目标。
:::

## 进入工作台

用户入口为 `/login`，管理入口默认为 `/admin`（可在安装时修改）。二者共用账号、密码和会话，管理权限由角色授权决定。Standalone 不提供登录或平台管理工作台。

笔记、账号安全、公告和管理操作见 [使用手册](workspace.md)。

## 运行命令行样板

CLI 的文本分析独立于笔记应用，无需启动 Web 或安装数据库：

```sh
make dev-cli ARGS='execute --text "Hello Unicore"'
```

## 接下来

- [创建自己的应用](development.md)：设置产品名称、代码仓库与桌面标识。
- [裁剪 demo 与可选能力](features.md)：构建只包含所需功能的产品。
- [开发第一个功能](first-feature.md)：通过笔记标签示例练习开发流程。
- [部署到服务器](deployment.md)：配置数据库、持久化目录和 HTTPS。
- [从源码构建](build.md)：生成 Web、桌面和 CLI 发行包。

启动失败时先查看终端日志，并检查端口、目录权限和数据库连接。常见问题见 [FAQ](faq.md)。
