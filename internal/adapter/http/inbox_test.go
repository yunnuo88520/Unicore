// Author: yunnuo <ymz@ebox.vip>
// Description: Inbox list honors contract pagination parameters and rejects out-of-range pages instead of silently clamping.
package httpadapter

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/realtime"
)

func TestInboxListPagination(t *testing.T) {
	ctx := context.Background()
	m, err := install.Open(ctx, install.Options{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	token, err := os.ReadFile(m.TokenPath())
	if err != nil {
		t.Fatal(err)
	}
	_, admin, err := m.Complete(ctx, strings.TrimSpace(string(token)), contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Inbox", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"})
	if err != nil {
		t.Fatal(err)
	}
	identity := m.Identity(false)
	user, err := identity.Create(ctx, contracts.UserCreate{Username: "member", Email: "member@example.test", Password: "test-password-strong", Role: "user"}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, raw, err := identity.Issue(ctx, user, 1)
	if err != nil {
		t.Fatal(err)
	}
	hub := realtime.New()
	defer hub.Close()
	router := New(Config{Core: bootstrap.Core(), Install: m, Hub: hub, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	server := httptest.NewServer(router)
	defer server.Close()
	client := server.Client()

	store, _, _, _ := m.Services()
	repo := &platformsql.Repository{Store: store}
	for i := 0; i < 25; i++ {
		if err = repo.DeliverInbox(ctx, store.DB, []string{user.ID}, "system", fmt.Sprintf("seed-%02d", i), "标题", "正文", ""); err != nil {
			t.Fatal(err)
		}
	}

	list := func(path string) (int, contracts.InboxList) {
		t.Helper()
		req, err := http.NewRequest("GET", server.URL+path, nil)
		if err != nil {
			t.Fatal(err)
		}
		req.AddCookie(&http.Cookie{Name: sessionCookie, Value: raw})
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			t.Fatal(err)
		}
		var payload struct {
			Data contracts.InboxList `json:"data"`
		}
		if err := json.Unmarshal(body, &payload); err != nil {
			t.Fatal(err)
		}
		return resp.StatusCode, payload.Data
	}

	status, data := list("/api/v1/inbox")
	if status != 200 || len(data.Items) != 20 || data.Total != 25 || data.Page != 1 || data.PageSize != 20 || data.Unread != 25 {
		t.Fatalf("default page mismatch: status=%d %+v", status, data)
	}
	status, data = list("/api/v1/inbox?page=2")
	if status != 200 || len(data.Items) != 5 || data.Page != 2 || data.Total != 25 {
		t.Fatalf("second page mismatch: status=%d %+v", status, data)
	}
	status, data = list("/api/v1/inbox?page=1&page_size=50")
	if status != 200 || len(data.Items) != 25 || data.PageSize != 50 {
		t.Fatalf("expanded page mismatch: status=%d %+v", status, data)
	}
	for _, path := range []string{"/api/v1/inbox?page=0", "/api/v1/inbox?page=100001", "/api/v1/inbox?page_size=51", "/api/v1/inbox?page=abc"} {
		if status, _ = list(path); status == 200 {
			t.Fatalf("invalid query must be rejected: %s", path)
		}
	}
	req, err := http.NewRequest("GET", server.URL+"/api/v1/inbox", nil)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 401 {
		t.Fatalf("anonymous inbox must be 401, got %d", resp.StatusCode)
	}
}
