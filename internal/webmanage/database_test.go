// Author: yunnuo <ymz@ebox.vip>
// Description: Candidate connections must refer to the same installed database; source may be offline.
package webmanage

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/secret"
)

func TestExternalConnectionReplacement(t *testing.T) {
	for _, driver := range []string{"postgres", "mysql"} {
		t.Run(driver, func(t *testing.T) {
			dsn := os.Getenv("UNICORE_MANAGEMENT_" + strings.ToUpper(driver) + "_DSN")
			foreign := os.Getenv("UNICORE_MANAGEMENT_" + strings.ToUpper(driver) + "_OTHER_DSN")
			if dsn == "" || foreign == "" {
				t.Skip("isolated source and other databases not configured")
			}
			ctx := context.Background()
			directory := t.TempDir()
			m, e := install.Open(ctx, install.Options{DataDir: directory})
			if e != nil {
				t.Fatal(e)
			}
			token, e := os.ReadFile(m.TokenPath())
			if e != nil {
				t.Fatal(e)
			}
			_, _, e = m.Complete(ctx, strings.TrimSpace(string(token)), contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: driver, Dsn: dsn}, SiteName: "Connection recovery", BaseUrl: "http://localhost:3000", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"})
			if e != nil {
				t.Fatal(e)
			}
			if e = m.Close(); e != nil {
				t.Fatal(e)
			}
			path := filepath.Join(directory, "installation.json")
			before, e := os.ReadFile(path)
			if e != nil {
				t.Fatal(e)
			}
			c, out := testConsole(foreign + "\n")
			if e = Run(ctx, []string{"database", "configure", "--data-dir", directory, "--dsn-stdin", "--yes"}, c); e == nil {
				t.Fatal("foreign/empty target accepted")
			}
			after, _ := os.ReadFile(path)
			if string(after) != string(before) {
				t.Fatal("failed validation changed installation")
			}
			if strings.Contains(out.String(), foreign) {
				t.Fatal("DSN leaked")
			}
			// Break the saved source connection. Repair must depend on the candidate, not the source.
			key, e := secret.Open(directory, "")
			if e != nil {
				t.Fatal(e)
			}
			var raw map[string]json.RawMessage
			if e = json.Unmarshal(before, &raw); e != nil {
				t.Fatal(e)
			}
			raw["dsn_encrypted"], _ = json.Marshal(key.Seal("unavailable-old-connection"))
			broken, _ := json.Marshal(raw)
			if e = os.WriteFile(path, broken, 0600); e != nil {
				t.Fatal(e)
			}
			c, out = testConsole(dsn + "\n")
			if e = Run(ctx, []string{"database", "configure", "--data-dir", directory, "--dsn-stdin", "--yes"}, c); e != nil {
				t.Fatal(e)
			}
			if strings.Contains(out.String(), dsn) {
				t.Fatal("new credentials leaked")
			}
			saved, _ := os.ReadFile(path)
			if e = json.Unmarshal(saved, &raw); e != nil {
				t.Fatal(e)
			}
			var encrypted string
			_ = json.Unmarshal(raw["dsn_encrypted"], &encrypted)
			plain, e := key.Open(encrypted)
			if e != nil || plain != dsn || strings.Contains(string(saved), dsn) {
				t.Fatal("new credentials not encrypted", e)
			}
			m, e = install.Open(ctx, install.Options{DataDir: directory})
			if e != nil {
				t.Fatal("reconfigured instance failed to start", e)
			}
			_ = m.Close()
		})
	}
}
