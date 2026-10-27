<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0010：补齐设置并在编译期裁剪授权/升级占位

状态：接受 · 日期：2026-10-27 · 作者：yunnuo / ymz@ebox.vip

设置清单审计发现缺少 ICP、独立发件人名、ICO 上传和版本授权占位。补齐这些边界，继续使用统一设置注册表、OpenAPI bootstrap、AppClient 和同源设计，不引入第二套配置或 schema。

ICP 分为编号/HTTPS 链接，公开 bootstrap 与工作台/账号页页脚共用；默认无编号，不展示备案声明。发件人别名属于 MIME 显示，不改变 SMTP 信封或连接指纹。系统通知复用原有加密队列及重试，提供内部调用 port 和模板；具体订阅/业务事件另行定义，不将设置模块变为公开发信接口。

ICO 是有边界的图片容器，仅 favicon 接受，支持 PNG/BI_RGB DIB 常见编码。验证容器尺寸与数据边界后重新编码 PNG，仍复用品牌引用/清理策略；不保存或公开上传的原始文件。Logo 不扩大格式范围。

用户当前只要求授权/升级占位。使用独立 Go build tags 与 Vite 编译常量，Make/archive 构建共享 FEATURE_LICENSE/FEATURE_UPDATER 输入；两项默认 false，非法值失败。关闭时 port 声明和 UI 均不进入相应产物；编译开启只显示待接入卡片，不执行虚假检查、不显示虚构新版本/Update Log。对应 API 暂不注册，两种构建均返回 JSON 404。OpenAPI 不加入尚无实现的检查/升级 operation。

预留 LicenseProvider.Check / ReleaseProvider.Latest 作为未来适配独立授权服务的边界，不预设服务地址、协议或签名算法；这些 port 按 tag 编译。后续真实对接需另补契约、权限、密钥/签名、超时/降级与真实日志。版本查询与实际安装是不同能力；tar 的受限升级器和 Docker 镜像替换仍按原设计分别实现。当前不初始化第三方客户端，没有网络副作用，bootstrap capability 只声明占位模块的构建能力。
