// Author: yunnuo <ymz@ebox.vip>
// Description: Execute the real checker over small transitive Go dependency graphs.
package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestCLIOutboundClientAndForbiddenAssemblies(t *testing.T) {
	binary := filepath.Join(t.TempDir(), "check-boundaries")
	if runtime.GOOS == "windows" {
		binary += ".exe"
	}
	if out, err := exec.Command("go", "build", "-o", binary, ".").CombinedOutput(); err != nil {
		t.Fatalf("build checker: %v %s", err, out)
	}
	const app = "example.test/boundary"
	for _, tc := range []struct{ name, layer, dependency, forbidden string }{
		{"outbound client", "cli", "net/http", ""},
		{"application HTTP adapter", "cli", app + "/internal/adapter/http", app + "/internal/adapter/http"},
		{"platform identity", "cli", app + "/internal/platform", app + "/internal/platform"},
		{"SQL", "cli", "database/sql", "database/sql"},
		{"local SQL bootstrap", "cli", app + "/internal/bootstrap/local", app + "/internal/bootstrap/local"},
		{"Wails", "cli", "github.com/wailsapp/wails/v2", "github.com/wailsapp/wails/v2"},
		{"chi server router", "cli", "github.com/go-chi/chi/v5", "github.com/go-chi/chi/v5"},
		{"domain HTTP", "domain", "net/http", "net/http"},
		{"usecase HTTP", "usecase", "net/http", "net/http"},
		{"module domain HTTP", "module-domain", "net/http", "net/http"},
		{"module usecase identity", "module-usecase", app + "/internal/platform", app + "/internal/platform"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			write := func(name, content string) {
				t.Helper()
				path := filepath.Join(dir, filepath.FromSlash(name))
				if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(path, []byte(content), 0600); err != nil {
					t.Fatal(err)
				}
			}
			write("go.mod", "module "+app+"\n\ngo 1.26.11\n")
			for _, p := range []string{"internal/domain", "internal/usecase", "internal/bootstrap/local", "internal/bootstrap/filelocal", "internal/adapter/desktop", "internal/adapter/http", "internal/platform"} {
				write(p+"/fixture.go", "package fixture\n")
			}
			dep := tc.dependency
			if strings.HasPrefix(dep, "github.com/") {
				version := "v2.0.0"
				if strings.HasSuffix(dep, "/v5") {
					version = "v5.0.0"
				}
				write("go.mod", "module "+app+"\n\ngo 1.26.11\nrequire "+dep+" "+version+"\nreplace "+dep+" => ./external\n")
				write("external/go.mod", "module "+dep+"\n\ngo 1.26.11\n")
				write("external/fixture.go", "package fixture\n")
			}
			write("cmd/cli/main.go", "package main\nfunc main() {}\n")
			path := "internal/adapter/protocol/client.go"
			if tc.layer == "cli" {
				write("cmd/cli/main.go", "package main\nimport _ \""+app+"/internal/adapter/protocol\"\nfunc main() {}\n")
			} else {
				path = map[string]string{"domain": "internal/domain/fixture.go", "usecase": "internal/usecase/fixture.go", "module-domain": "internal/modules/demo/domain/fixture.go", "module-usecase": "internal/modules/demo/usecase/fixture.go"}[tc.layer]
			}
			write(path, "package fixture\nimport _ \""+dep+"\"\n")
			command := exec.Command(binary)
			command.Dir = dir
			out, err := command.CombinedOutput()
			if tc.forbidden == "" {
				if err != nil {
					t.Fatalf("client denied: %v %s", err, out)
				}
			} else if err == nil || !strings.Contains(string(out), "depends on forbidden package "+tc.forbidden) {
				t.Fatalf("expected boundary rejection %s: %v %s", tc.forbidden, err, out)
			}
		})
	}
}
