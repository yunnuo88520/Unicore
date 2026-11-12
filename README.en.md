<!-- Author: yunnuo <ymz@ebox.vip> -->
# Unicore application template

[简体中文](README.md) · **English**

This repository is generated from the [Unicore](https://github.com/yunnuo88520/Unicore) framework template: one core serving Web, desktop and CLI. `product.identity.json` is the single product-identity entry; see docs/product/framework-upgrade.md for upstream source sync.

Development:

```sh
make install
make docs
make test
make dev-server
# In a second terminal:
make dev-web
```

Open /install on first Web launch (desktop initializes its local database; CLI has no database). Boundaries and deployment guides live in [docs/product](docs/product/index.md).
