// Author: yunnuo <ymz@ebox.vip>
// Description: The live log stream refuses anonymous and restricted administrators, streams replay and live lines, and terminates on disconnect or drain.
package httpadapter

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/logging"
	"github.com/yunnuo/unicore/internal/realtime"
)

func TestLogStreamAccessAndFrames(t *testing.T) {
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
	_, admin, err := m.Complete(ctx, strings.TrimSpace(string(token)), contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Logs", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"})
	if err != nil {
		t.Fatal(err)
	}
	_, adminRaw, err := m.Identity(true).Issue(ctx, admin, 1)
	if err != nil {
		t.Fatal(err)
	}
	adminCookie := &http.Cookie{Name: administratorSessionCookie, Value: adminRaw}

	broadcast := logging.NewBroadcastWriter()
	router := New(Config{Core: bootstrap.Core(), Install: m, Hub: realtime.New(), LogBroadcast: broadcast, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	server := httptest.NewServer(router)
	defer server.Close()
	client := server.Client()
	client.Timeout = 3 * time.Second

	jsonRequest := func(method, path string, body any, cookie *http.Cookie, csrf string) ([]byte, *http.Response) {
		t.Helper()
		var payload io.Reader
		if body != nil {
			raw, e := json.Marshal(body)
			if e != nil {
				t.Fatal(e)
			}
			payload = bytes.NewReader(raw)
		}
		req, e := http.NewRequest(method, server.URL+path, payload)
		if e != nil {
			t.Fatal(e)
		}
		if cookie != nil {
			req.AddCookie(cookie)
		}
		if csrf != "" {
			req.Header.Set("X-CSRF-Token", csrf)
		}
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		resp, e := client.Do(req)
		if e != nil {
			t.Fatal(e)
		}
		defer resp.Body.Close()
		data, e := io.ReadAll(resp.Body)
		if e != nil {
			t.Fatal(e)
		}
		return data, resp
	}

	// Anonymous callers are refused before anything streams.
	if _, resp := jsonRequest("GET", "/api/v1/admin/logs/stream", nil, nil, ""); resp.StatusCode != 401 {
		t.Fatalf("anonymous: want 401, got %d", resp.StatusCode)
	}

	// A restricted administrator passes the session and logs:read gates but
	// still fails the superAdmin reservation in the contract policy.
	data, resp := jsonRequest("GET", "/api/v1/admin/bootstrap", nil, adminCookie, "")
	if resp.StatusCode != 200 {
		t.Fatalf("bootstrap: %d %s", resp.StatusCode, data)
	}
	var boot struct {
		Data *struct {
			CsrfToken *string `json:"csrf_token"`
		} `json:"data"`
	}
	if e := json.Unmarshal(data, &boot); e != nil || boot.Data == nil || boot.Data.CsrfToken == nil {
		t.Fatalf("bootstrap payload: %s", data)
	}
	csrf := *boot.Data.CsrfToken
	data, resp = jsonRequest("POST", "/api/v1/admin/roles", map[string]any{"name": "受限管理员", "realm": "administrator", "permissions": []string{"users:read"}}, adminCookie, csrf)
	if resp.StatusCode != 200 {
		t.Fatalf("role create: %d %s", resp.StatusCode, data)
	}
	var role struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if e := json.Unmarshal(data, &role); e != nil || role.Data.ID == "" {
		t.Fatalf("role payload: %s", data)
	}
	data, resp = jsonRequest("POST", "/api/v1/admin/administrators", contracts.UserCreate{Username: "ops", Email: "ops@example.test", Password: "test-password-strong", Role: role.Data.ID}, adminCookie, csrf)
	if resp.StatusCode != 200 {
		t.Fatalf("administrator create: %d %s", resp.StatusCode, data)
	}
	var created struct {
		Data contracts.User `json:"data"`
	}
	if e := json.Unmarshal(data, &created); e != nil || created.Data.ID == "" {
		t.Fatalf("administrator payload: %s", data)
	}
	_, opsRaw, e := m.Identity(true).Issue(ctx, created.Data, 1)
	if e != nil {
		t.Fatal(e)
	}
	if _, resp := jsonRequest("GET", "/api/v1/admin/logs/stream", nil, &http.Cookie{Name: administratorSessionCookie, Value: opsRaw}, ""); resp.StatusCode != 403 {
		t.Fatalf("restricted administrator: want 403, got %d", resp.StatusCode)
	}

	open := func(options *context.CancelFunc) (*http.Response, *bufio.Reader) {
		t.Helper()
		req, e := http.NewRequest("GET", server.URL+"/api/v1/admin/logs/stream", nil)
		if e != nil {
			t.Fatal(e)
		}
		if options != nil {
			requestCtx, cancel := context.WithCancel(ctx)
			*options = cancel
			req = req.WithContext(requestCtx)
		}
		req.AddCookie(adminCookie)
		resp, e := client.Do(req)
		if e != nil {
			t.Fatal(e)
		}
		return resp, bufio.NewReader(resp.Body)
	}
	frame := func(reader *bufio.Reader) (string, error) {
		var result strings.Builder
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				return result.String(), err
			}
			result.WriteString(line)
			if line == "\n" {
				return result.String(), nil
			}
		}
	}

	// The client closing the request ends the server-side handler.
	var cancel context.CancelFunc
	live, _ := open(&cancel)
	if live.StatusCode != 200 {
		t.Fatal(live.Status)
	}
	cancel()
	if _, e := io.ReadAll(live.Body); e != nil && !strings.Contains(strings.ToLower(e.Error()), "context") {
		t.Fatal("client cancel", e)
	}
	live.Body.Close()

	// Replay reaches the subscriber before live traffic; closing the
	// broadcast terminates the stream like the graceful drain does.
	if _, e := broadcast.Write([]byte("boot-a\nboot-b\n")); e != nil {
		t.Fatal(e)
	}
	resp, reader := open(nil)
	defer resp.Body.Close()
	if resp.StatusCode != 200 || resp.Header.Get("Content-Type") != "text/event-stream" {
		t.Fatal(resp.Status, resp.Header)
	}
	if got, e := frame(reader); e != nil || got != "retry: 5000\n\n" {
		t.Fatal(got, e)
	}
	for _, want := range []string{"data: boot-a\n\n", "data: boot-b\n\n"} {
		if got, e := frame(reader); e != nil || got != want {
			t.Fatalf("replay %q, want %q: %v", got, want, e)
		}
	}
	if _, e := broadcast.Write([]byte("live\n")); e != nil {
		t.Fatal(e)
	}
	if got, e := frame(reader); e != nil || got != "data: live\n\n" {
		t.Fatal(got, e)
	}
	if e := broadcast.Close(); e != nil {
		t.Fatal(e)
	}
	if data, e := io.ReadAll(reader); e != nil || len(data) != 0 {
		t.Fatalf("stream did not close: %q %v", data, e)
	}
}
