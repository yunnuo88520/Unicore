// Author: yunnuo <ymz@ebox.vip>
// Description: Web server management commands, separate from the database-free business CLI.
package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"os"

	"github.com/yunnuo/unicore/assets/theme"
	"github.com/yunnuo/unicore/internal/buildinfo"
	"github.com/yunnuo/unicore/internal/config"
)

func management(args []string, output io.Writer) (bool, error) {
	if len(args) == 0 {
		return false, nil
	}
	switch args[0] {
	case "help", "--help", "-h", "unicorehelp":
		fmt.Fprintf(output, "%s %s · Web/API 服务\n\n用法 / Usage:\n  unicore [启动参数]          启动服务 / Start server (configuration optional)\n  unicorehelp                  显示帮助 / Show help\n\n命令 / Commands:\n  help                         显示帮助 / Show help\n  config generate [--output PATH]  生成配置，拒绝覆盖 / Generate configuration\n  version                      显示版本 / Show version\n\n兼容别名 / Alias:\n  generate-config              等同于 config generate\n\n首次安装 / First install: /install\n\n", theme.Current.Brand.Name, buildinfo.Version)
		fmt.Fprint(output, config.WebUsage)
		return true, nil
	case "version":
		if len(args) != 1 {
			return true, errors.New("version takes no arguments")
		}
		fmt.Fprintf(output, "%s %s (%s)\n", theme.Current.Brand.Name, buildinfo.Version, buildinfo.Commit)
		return true, nil
	case "config", "generate-config":
		rest := args[1:]
		if args[0] == "config" {
			if len(rest) == 0 || rest[0] != "generate" {
				return true, errors.New("use config generate [--output PATH]")
			}
			rest = rest[1:]
		}
		flags := flag.NewFlagSet("config generate", flag.ContinueOnError)
		flags.SetOutput(output)
		path := flags.String("output", "unicore.json", "new configuration path; existing files are refused")
		if err := flags.Parse(rest); err != nil {
			return true, commandError(err)
		}
		if flags.NArg() != 0 {
			return true, errors.New("unexpected configuration arguments")
		}
		if err := config.Generate(*path); err != nil {
			return true, err
		}
		fmt.Fprintf(output, "配置已生成 / Configuration created: %s\n使用 / Run: unicore --config <path>\n", *path)
		return true, nil
	}
	return false, nil
}

func commandError(err error) error {
	if errors.Is(err, flag.ErrHelp) {
		return nil
	}
	return err
}

func managementMain() (bool, error) { return management(os.Args[1:], os.Stdout) }
