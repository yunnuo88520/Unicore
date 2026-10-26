---
name: add-cli-command
description: 为 Unicore Cobra CLI 增加直接调用共享 Core 的命令、stdin/文件输入和结构化输出。
metadata:
  author: yunnuo <ymz@ebox.vip>
---

# add-cli-command

## trigger

新增子命令、参数、输入输出或 completion。

## inputs

名称、参数、stdin/文件规则、输出、退出码及共享用例。

## steps

1. 阅读架构，命令放 internal/adapter/cli，通过 usecase port 调用。
2. 区分显式空参数和未传参数；限制 stdin/文件大小；结果 stdout、错误 stderr。
3. 配置 Cobra Args/flags/help，沿用 completion，不启动服务或隐式建 DB。
4. 测试管道、错误参数、超限、取消与结果，更新 README。

## output

命令、必要用例变更、行为测试、帮助与文档。

## forbidden

依赖 HTTP server、Wails、身份或持久 SQL；复制领域算法；日志泄露 secret。

## validation

go run ./scripts/check-boundaries、make test build-cli，真实 binary/管道/completion，必要时交叉构建。
