// Author: yunnuo <ymz@ebox.vip>
// Description: Inspect real transitive dependency graphs, not import text matches.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
)

// modulePath reads go.mod so the rules bind the application's own packages in
// derived projects too, not only the framework source tree.
func modulePath() string {
	data, err := os.ReadFile("go.mod")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "module ") {
			return strings.TrimSpace(strings.TrimPrefix(line, "module "))
		}
	}
	fmt.Fprintln(os.Stderr, "go.mod has no module path")
	os.Exit(1)
	return ""
}

// forbiddenDomain lists the packages a domain layer may never depend on.
func forbiddenDomain(app string) []string {
	return []string{"github.com/minio/minio-go/v7", "github.com/aliyun/aliyun-oss-go-sdk/oss", "github.com/tencentyun/cos-go-sdk-v5", "net/http", "database/sql", "github.com/wailsapp/", app + "/internal/adapter", app + "/internal/platform", "github.com/coreos/go-oidc", "golang.org/x/oauth2", app + "/internal/adapter/oidc", "net/smtp", app + "/internal/mailer", app + "/internal/adapter/mail", app + "/internal/usecase"}
}

// forbiddenUsecase lists the packages a usecase layer may never depend on.
func forbiddenUsecase(app string) []string {
	return []string{"github.com/minio/minio-go/v7", "github.com/aliyun/aliyun-oss-go-sdk/oss", "github.com/tencentyun/cos-go-sdk-v5", "net/http", "database/sql", "github.com/wailsapp/", app + "/internal/adapter", app + "/internal/platform", "github.com/coreos/go-oidc", "golang.org/x/oauth2", app + "/internal/adapter/oidc", "net/smtp", app + "/internal/mailer"}
}

func main() {
	app := modulePath()
	checks := []struct {
		target    string
		forbidden []string
	}{
		{"./cmd/cli", []string{app + "/internal/adapter/http", app + "/internal/adapter/desktop", app + "/internal/bootstrap/local", app + "/internal/bootstrap/filelocal", app + "/internal/install", app + "/migrations", app + "/internal/updates", app + "/internal/adapter/updatechannel", app + "/internal/adapter/updateinstall", "github.com/minio/minio-go/v7", "github.com/aliyun/aliyun-oss-go-sdk/oss", "github.com/tencentyun/cos-go-sdk-v5", "database/sql", "github.com/wailsapp/", "github.com/go-chi/", app + "/internal/platform", "github.com/coreos/go-oidc", "golang.org/x/oauth2", app + "/internal/adapter/oidc", "net/smtp", app + "/internal/mailer", app + "/internal/adapter/mail", app + "/internal/adapter/storage", "modernc.org/sqlite", "github.com/mattn/go-sqlite3", "github.com/jackc/pgx", "github.com/go-sql-driver/"}},
		{"./internal/domain", forbiddenDomain(app)},
		{"./internal/usecase", forbiddenUsecase(app)},
		{"./internal/bootstrap/local", []string{"github.com/minio/minio-go/v7", "github.com/aliyun/aliyun-oss-go-sdk/oss", "github.com/tencentyun/cos-go-sdk-v5", app + "/internal/platform", "github.com/coreos/go-oidc", "golang.org/x/oauth2", app + "/internal/adapter/oidc", "net/smtp", app + "/internal/mailer", app + "/internal/adapter/mail", app + "/internal/install", app + "/internal/adapter/storage/platformsql", app + "/internal/adapter/storage/webdb", "github.com/jackc/pgx", "github.com/go-sql-driver/mysql"}},
		{"./internal/bootstrap/filelocal", []string{"github.com/minio/minio-go/v7", "github.com/aliyun/aliyun-oss-go-sdk/oss", "github.com/tencentyun/cos-go-sdk-v5", app + "/internal/platform", "github.com/coreos/go-oidc", "golang.org/x/oauth2", app + "/internal/adapter/oidc", "net/smtp", app + "/internal/mailer", app + "/internal/adapter/mail", app + "/internal/install", app + "/internal/adapter/storage/platformsql"}},
		{"./internal/adapter/desktop", []string{"github.com/minio/minio-go/v7", "github.com/aliyun/aliyun-oss-go-sdk/oss", "github.com/tencentyun/cos-go-sdk-v5", app + "/internal/platform", "github.com/coreos/go-oidc", "golang.org/x/oauth2", app + "/internal/adapter/oidc", "net/smtp", app + "/internal/mailer", app + "/internal/adapter/mail", app + "/internal/install", app + "/internal/adapter/storage/platformsql"}},
	}
	// Business modules keep the same onion rules inside their own trees:
	// domain may only depend on the core domain, usecase on domain and contracts.
	// A module may legitimately ship only its descriptor, so layer packages are
	// checked when their directory exists and skipped otherwise.
	moduleDirs, err := os.ReadDir("internal/modules")
	if err == nil {
		for _, entry := range moduleDirs {
			if !entry.IsDir() {
				continue
			}
			slug := entry.Name()
			for _, layer := range []struct {
				name      string
				forbidden func(string) []string
			}{{"domain", forbiddenDomain}, {"usecase", forbiddenUsecase}} {
				if info, err := os.Stat("internal/modules/" + slug + "/" + layer.name); err != nil || !info.IsDir() {
					continue
				}
				checks = append(checks,
					struct {
						target    string
						forbidden []string
					}{"./internal/modules/" + slug + "/" + layer.name, layer.forbidden(app)})
			}
		}
	}
	for _, check := range checks {
		output, err := exec.Command("go", "list", "-deps", "-json", check.target).Output()
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		decoder := json.NewDecoder(bytes.NewReader(output))
		for {
			var pkg struct{ ImportPath string }
			if err := decoder.Decode(&pkg); err == io.EOF {
				break
			} else if err != nil {
				panic(err)
			}
			for _, forbidden := range check.forbidden {
				if pkg.ImportPath == forbidden || strings.HasPrefix(pkg.ImportPath, forbidden+"/") || (strings.HasSuffix(forbidden, "/") && strings.HasPrefix(pkg.ImportPath, forbidden)) {
					fmt.Fprintf(os.Stderr, "%s depends on forbidden package %s\n", check.target, pkg.ImportPath)
					os.Exit(1)
				}
			}
		}
		fmt.Printf("PASS %s dependency boundaries\n", check.target)
	}
}
