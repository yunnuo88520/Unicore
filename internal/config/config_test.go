// Author: yunnuo <ymz@ebox.vip>
// Description: Configuration precedence and rejection of unsafe/invalid runtime options.
package config

import (
	"testing"
	"time"
)

func TestWebPrecedence(t *testing.T) {
	env := map[string]string{"APP_LISTEN": "127.0.0.1:9001", "APP_LOG_LEVEL": "warn", "APP_SHUTDOWN_TIMEOUT": "8s", "APP_API_DOCS": "true"}
	options, err := LoadWeb([]string{"--listen", "127.0.0.1:9002", "--shutdown-timeout", "3s"}, func(key string) string { return env[key] })
	if err != nil || options.Listen != "127.0.0.1:9002" || options.Log.Level != "warn" || options.Log.Format != "json" || options.ShutdownTimeout != 3*time.Second || !options.APIDocs || options.ReadinessTimeout != 2*time.Second {
		t.Fatalf("precedence/defaults: %+v %v", options, err)
	}
}
func TestInvalidWebOptions(t *testing.T) {
	for _, args := range [][]string{{"--log-level", "verbose"}, {"--log-format", "xml"}, {"--profile", "desktop"}, {"--deployment", "unknown"}, {"--listen", "missing-port"}, {"--shutdown-timeout", "0s"}, {"--readiness-timeout", "11s"}, {"--api-docs", "maybe"}, {"--monitor-listen", "0.0.0.0:9000"}, {"--monitor-listen", "localhost:9000"}, {"--monitor-listen", "127.0.0.1:99999"}, {"--secret-key", "never-echo-this"}} {
		_, err := LoadWeb(args, func(string) string { return "" })
		if err == nil {
			t.Errorf("accepted %v", args)
		}
	}
	for _, address := range []string{"127.0.0.1:0", "[::1]:9090"} {
		if _, err := LoadWeb([]string{"--monitor-listen", address}, func(string) string { return "" }); err != nil {
			t.Fatal(err)
		}
	}
}
