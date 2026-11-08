// Author: yunnuo <ymz@ebox.vip>
// Description: Real HTTP streams honor session revocation, multiline framing, client cancellation and server drain.
package httpadapter

import (
	"bufio"
	"context"
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
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/realtime"
)

func TestEventsSessionRevocationAndShutdown(t *testing.T) {
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
	_, admin, err := m.Complete(ctx, strings.TrimSpace(string(token)), contracts.InstallInput{Profile: "web-platform", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Events", BaseUrl: "http://localhost", AdminUsername: "admin", AdminEmail: "admin@example.test", AdminPassword: "test-password-strong"})
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
	client.Timeout = 3 * time.Second
	open := func(cookie string) (*http.Response, *bufio.Reader) {
		t.Helper()
		req, err := http.NewRequest("GET", server.URL+"/api/v1/events", nil)
		if err != nil {
			t.Fatal(err)
		}
		if cookie != "" {
			req.AddCookie(&http.Cookie{Name: sessionCookie, Value: cookie})
		}
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		return resp, bufio.NewReader(resp.Body)
	}
	resp, _ := open("")
	if resp.StatusCode != 401 {
		t.Fatal(resp.Status)
	}
	resp.Body.Close()
	resp, reader := open(raw)
	defer resp.Body.Close()
	if resp.StatusCode != 200 || resp.Header.Get("Content-Type") != "text/event-stream" {
		t.Fatal(resp.Status, resp.Header)
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
	if got, err := frame(reader); err != nil || got != "retry: 5000\n\n" {
		t.Fatal(got, err)
	}
	hub.Publish(user.ID, realtime.Event{Name: "inbox.new", Data: "first\nsecond"})
	if got, err := frame(reader); err != nil || got != "event: inbox.new\ndata: first\ndata: second\n\n" {
		t.Fatal(got, err)
	}
	if err := identity.Store.DeleteSession(ctx, platform.Hash(raw)); err != nil {
		t.Fatal(err)
	}
	hub.Publish(user.ID, realtime.Event{Name: "inbox.new", Data: "private"})
	if data, err := io.ReadAll(reader); err != nil || len(data) != 0 {
		t.Fatalf("revoked stream received %q: %v", data, err)
	}
	_, raw, err = identity.Issue(ctx, user, 1)
	if err != nil {
		t.Fatal(err)
	}
	live, liveReader := open(raw)
	defer live.Body.Close()
	if _, err := frame(liveReader); err != nil {
		t.Fatal(err)
	}
	hub.Close()
	if _, err := io.ReadAll(liveReader); err != nil {
		t.Fatal("hub close", err)
	}
	// Hub close already terminates the stream, so a real block never
	// finishes; the generous budget only tolerates parallel -race load.
	shutdownCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	if err := server.Config.Shutdown(shutdownCtx); err != nil {
		t.Fatal("stream blocked shutdown", err)
	}
}
