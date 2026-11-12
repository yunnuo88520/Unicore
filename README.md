<!-- Author: yunnuo <ymz@ebox.vip> -->
# Unicore 应用模板

**简体中文** · [English](README.en.md)

本仓库由 [Unicore](https://github.com/yunnuo88520/Unicore) 框架模板生成：一份核心，运行于 Web、桌面与 CLI。产品身份唯一入口为 `product.identity.json`，上游源码同步见 docs/product/framework-upgrade.md。

开发：

```sh
make install
make docs
make test
make dev-server
# 第二个终端
make dev-web
```

首次启动访问 /install（桌面自动初始化本地数据库，CLI 不连接数据库）。功能边界与部署指南见 [docs/product](docs/product/index.md)。
