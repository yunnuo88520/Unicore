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

func main() {
	checks := []struct {
		target    string
		forbidden []string
	}{
		{"./cmd/cli", []string{"net/http", "database/sql", "github.com/wailsapp/", "github.com/go-chi/", "github.com/yunnuo/unicore/internal/platform", "github.com/yunnuo/unicore/internal/adapter/storage", "modernc.org/sqlite", "github.com/mattn/go-sqlite3", "github.com/jackc/pgx", "github.com/go-sql-driver/"}},
		{"./internal/domain", []string{"net/http", "database/sql", "github.com/wailsapp/", "github.com/yunnuo/unicore/internal/adapter", "github.com/yunnuo/unicore/internal/platform", "github.com/yunnuo/unicore/internal/usecase"}},
		{"./internal/usecase", []string{"net/http", "database/sql", "github.com/wailsapp/", "github.com/yunnuo/unicore/internal/adapter", "github.com/yunnuo/unicore/internal/platform"}},
		{"./internal/bootstrap/local", []string{"github.com/yunnuo/unicore/internal/platform", "github.com/yunnuo/unicore/internal/install", "github.com/yunnuo/unicore/internal/adapter/storage/platformsql", "github.com/yunnuo/unicore/internal/adapter/storage/webdb", "github.com/jackc/pgx", "github.com/go-sql-driver/mysql"}},
		{"./internal/adapter/desktop", []string{"github.com/yunnuo/unicore/internal/platform", "github.com/yunnuo/unicore/internal/install", "github.com/yunnuo/unicore/internal/adapter/storage/platformsql"}},
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
