// Author: yunnuo <ymz@ebox.vip>
// Description: Transport gate unit tests: origin trust, limits projection, language pick and error mapping.
package mcp

import (
	"errors"
	"net/http"
	"testing"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/yunnuo/unicore/internal/mcp"
)

func TestOriginAllowed(t *testing.T) {
	surface := &Surface{}
	values := map[string]string{
		"site.base_url":       "https://uc.example.com",
		"mcp.allowed_origins": "https://docs.example.com, http://localhost:5173",
	}
	request := func(origin string) *http.Request {
		r, _ := http.NewRequest(http.MethodPost, "https://uc.example.com/mcp", nil)
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		return r
	}
	allowed := map[string]bool{
		"":                         true, // protocol client without Origin
		"https://uc.example.com":   true, // same-origin base_url
		"https://docs.example.com": true, // registered allow-list
		"http://localhost:5173":    true, // loopback development origin
	}
	for origin, want := range allowed {
		if got := surface.originAllowed(request(origin), values); got != want {
			t.Errorf("origin %q allowed = %v, want %v", origin, got, want)
		}
	}
	denied := []string{
		"https://evil.example.com", // unregistered
		"null",                     // sandboxed browser origin
		"https://uc.example.com/path",
		"http://uc.example.com", // scheme downgrade of the trusted base
	}
	for _, origin := range denied {
		if surface.originAllowed(request(origin), values) {
			t.Errorf("origin %q unexpectedly allowed", origin)
		}
	}
}

func TestLimitsOf(t *testing.T) {
	limits, ok := limitsOf(map[string]string{
		"mcp.default_timeout_seconds": "45", "mcp.max_request_bytes": "1048576",
		"mcp.max_result_bytes": "262144", "mcp.global_concurrency": "64",
		"mcp.user_concurrency": "4", "mcp.credential_concurrency": "2",
		"mcp.user_calls_per_minute": "120", "mcp.credential_calls_per_minute": "60",
	})
	if !ok || limits.TimeoutSeconds != 45 {
		t.Fatalf("configured limits = %+v, %v", limits, ok)
	}
	// Missing values fall back to the documented defaults.
	limits, ok = limitsOf(map[string]string{})
	if !ok || limits.TimeoutSeconds != 30 || limits.UserCallsPerMinute != 120 {
		t.Fatalf("default limits = %+v, %v", limits, ok)
	}
	// A corrupt value that would widen bounds fails closed.
	if _, ok = limitsOf(map[string]string{"mcp.default_timeout_seconds": "99999"}); ok {
		t.Fatal("misconfigured limits unexpectedly accepted")
	}
}

func TestLanguageOf(t *testing.T) {
	cases := map[string]string{
		"":                        "en",
		"zh-CN,zh;q=0.9":          "zh",
		"en-US,en;q=0.9":          "en",
		"fr-FR,zh;q=0.8,en;q=0.7": "zh",
	}
	for header, want := range cases {
		if got := languageOf(header); got != want {
			t.Errorf("languageOf(%q) = %q, want %q", header, got, want)
		}
	}
}

func TestProtocolErrorMapping(t *testing.T) {
	surface := &Surface{}
	cases := map[string]struct {
		err  error
		want string
	}{
		"unavailable":  {mcp.ErrUnavailable("disabled"), "capability unavailable"},
		"forbidden":    {mcp.ErrForbidden("denied"), "capability unavailable"},
		"rate":         {mcp.ErrRateLimited("budget"), "rate limit exceeded, retry later"},
		"timeout":      {&mcp.Error{Category: mcp.CatInternal, Code: "timed_out"}, "tool execution timed out"},
		"cancelled":    {&mcp.Error{Category: mcp.CatInternal, Code: "cancelled"}, "tool call was cancelled"},
		"internal":     {mcp.ErrInternal("sql detail"), "internal error"},
		"unclassified": {errors.New("raw module failure"), "internal error"},
	}
	for name, testCase := range cases {
		mapped := surface.protocolError(testCase.err)
		if mapped.Error() != testCase.want {
			t.Errorf("%s: mapped = %q, want %q", name, mapped.Error(), testCase.want)
		}
	}
}

func TestClientIdentityFromMeta(t *testing.T) {
	request := &sdk.CallToolRequest{}
	if name, version := clientIdentity(request); name != "" || version != "" {
		t.Fatalf("empty client info = %q %q", name, version)
	}
}
