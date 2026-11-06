<!-- Author: yunnuo <ymz@ebox.vip> -->
# 桌面与 CLI 安装

Web 服务器部署见 [从零部署](deployment.md)；本页只覆盖原生桌面应用与命令行工具。所有包从 [Releases](https://github.com/yunnuo88520/Unicore/releases) 下载，先按发布说明核对 SHA-256 与签名状态再使用。

## 桌面（Wails 原生应用）

| 系统 | 包 | 首次打开 |
| --- | --- | --- |
| macOS | `.dmg` | 拖入 Applications；免费分发未做 Apple 公证，首次打开若被 Gatekeeper 拦截，右键 → 打开，或在"隐私与安全性"中允许。不要绕过系统安全策略运行来历不明的包 |
| Windows | 独立 `.exe` | 免费分发未做代码签名，SmartScreen 可能提示"已保护你的电脑"，选择"仍要运行"前先核对下载来源与校验和 |
| Linux | 桌面 tar 包 | 解压后运行其中的桌面入口；依赖随目标发行版自行确认，构建矩阵见 [构建指南](build.md) |

桌面应用自动使用本地 SQLite，不启动 Web 服务、没有安装向导与平台账号；业务数据与设置在应用私有数据目录中，卸载前如需保留先参考 [备份恢复](backup.md) 完成备份。桌面构建成功不等于目标系统已验证窗口与更新行为，发行说明中的验证范围以实际记录为准。

## CLI

Web 完整包内只有一个 `unicore` 入口，同时承担服务、帮助与离线运维；独立 CLI 包的入口为根目录的可执行文件（名称随产品身份生成，框架默认 `unicore`）。

```sh
./unicore help
./unicore execute --text "你好 Unicore"   # 直接调用共享 Core，不启动 Web、不建库
```

CLI 不引入 HTTP、数据库驱动或平台身份，适合脚本与管道；输出为 JSON，便于自动化。服务器上的运维场景（服务安装、备份恢复、管理员密码恢复）使用同一入口的子命令，见 [配置说明的管理命令](configuration.md#web-管理命令)。

## 校验与信任

- 发布资产带 `checksums.txt`；下载后先 `sha256sum -c` 再解压。
- 桌面更新签名使用 Ed25519 发布者签名与防降级检查；系统级签名/公证状态以对应 Release 说明为准，未签名的包不能冒充已签名。
- 不要从第三方镜像下载安装包；来源与构建过程证明见 [更新与签名](updates.md)。
