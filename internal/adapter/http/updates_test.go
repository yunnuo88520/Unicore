// Author: yunnuo <ymz@ebox.vip>
// Description: Verify local Host/peer/Origin controls and the narrow update transport boundary.
package httpadapter

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

type updateProbe struct{ calls int }

func (p *updateProbe) Overview(context.Context) contracts.UpdateOverview {
	p.calls++
	return contracts.UpdateOverview{CurrentVersion: "1.0.0", History: []contracts.UpdateRelease{{Version: "1.0.0", Notes: "offline"}}}
}
func (p *updateProbe) Check(c context.Context) contracts.UpdateOverview { return p.Overview(c) }
func (p *updateProbe) Apply(context.Context, contracts.UpdateApplyInput) (contracts.UpdateJob, error) {
	p.calls++
	return contracts.UpdateJob{Status: "downloading"}, nil
}
func TestLocalUpdateNetworkBoundary(t *testing.T) {
	manager, e := install.Open(t.Context(), install.Options{DataDir: t.TempDir()})
	if e != nil {
		t.Fatal(e)
	}
	defer manager.Close()
	token, _ := os.ReadFile(manager.TokenPath())
	if _, _, e = manager.Complete(t.Context(), strings.TrimSpace(string(token)), contracts.InstallInput{Profile: "web-standalone", Database: contracts.DatabaseInput{Driver: "sqlite"}, SiteName: "Local", BaseUrl: "http://localhost"}); e != nil {
		t.Fatal(e)
	}
	probe := &updateProbe{}
	router := New(Config{Install: manager, Updates: probe})
	for _, tc := range []struct {
		method, path, host, peer, origin, media string
		status                                  int
	}{
		{"GET", "/updates", "localhost", "127.0.0.1:1234", "", "", 200},
		{"GET", "/updates", "[::1]:8080", "[::1]:1234", "", "", 200},
		{"GET", "/updates", "evil.example", "127.0.0.1:1234", "", "", 403},
		{"GET", "/updates", "localhost", "10.0.0.2:1234", "", "", 403},
		{"POST", "/updates/check", "localhost", "127.0.0.1:1234", "https://evil.example", "application/json", 403},
		{"POST", "/updates/check", "localhost", "127.0.0.1:1234", "", "text/plain", 415},
		{"POST", "/updates/check", "localhost", "127.0.0.1:1234", "http://localhost", "application/json", 200},
		{"GET", "/admin/updates", "localhost", "127.0.0.1:1234", "", "", 404},
	} {
		r := httptest.NewRequest(tc.method, "http://"+tc.host+"/api/v1"+tc.path, bytes.NewReader([]byte("{}")))
		r.RemoteAddr = tc.peer
		r.Header.Set("Origin", tc.origin)
		r.Header.Set("Content-Type", tc.media)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		if w.Code != tc.status {
			t.Fatal(tc, w.Code, w.Body.String())
		}
	}
	if probe.calls != 3 {
		t.Fatal("rejected request reached update service", probe.calls)
	}
	r := httptest.NewRequest("GET", "http://localhost/api/v1/updates", nil)
	r.RemoteAddr = "127.0.0.1:1234"
	w := httptest.NewRecorder()
	New(Config{Install: manager}).ServeHTTP(w, r)
	if w.Code != 404 {
		t.Fatal(w.Code)
	}
	var b contracts.UpdateOverviewResponse
	_ = json.Unmarshal(w.Body.Bytes(), &b)
}
