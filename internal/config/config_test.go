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

func TestWebDefaultPort(t *testing.T) {
	options, err := LoadWeb(nil, func(string) string { return "" })
	if err != nil || options.Listen != "127.0.0.1:3000" {
		t.Fatal(options, err)
	}
}

func TestLoggingOptions(t *testing.T) {
	env := map[string]string{"APP_LOG_FILE": "true", "APP_LOG_MAX_AGE_DAYS": "30", "APP_LOG_MAX_SIZE_MB": "5", "APP_LOG_MAX_TOTAL_MB": "50"}
	options, err := Logging(func(key string) string { return env[key] })
	if err != nil || !options.File || options.MaxAgeDays != 30 || options.MaxSizeMB != 5 || options.MaxTotalMB != 50 {
		t.Fatalf("log options: %+v %v", options, err)
	}
	defaults, err := Logging(func(string) string { return "" })
	if err != nil || defaults.File || defaults.MaxAgeDays != 0 || defaults.MaxSizeMB != 10 || defaults.MaxTotalMB != 500 {
		t.Fatalf("log defaults: %+v %v", defaults, err)
	}
	for key, bad := range map[string]string{"APP_LOG_FILE": "yes", "APP_LOG_MAX_AGE_DAYS": "-1", "APP_LOG_MAX_SIZE_MB": "0", "APP_LOG_MAX_TOTAL_MB": "4"} {
		failing := map[string]string{}
		for name, value := range env {
			failing[name] = value
		}
		failing[key] = bad
		if _, err = Logging(func(k string) string { return failing[k] }); err == nil {
			t.Fatalf("accepted %s=%s", key, bad)
		}
	}
	web, err := LoadWeb([]string{"--log-file=true", "--log-max-age-days", "7", "--log-max-size-mb", "2", "--log-max-total-mb", "0"}, func(string) string { return "" })
	if err != nil || !web.Log.File || web.Log.MaxAgeDays != 7 || web.Log.MaxSizeMB != 2 || web.Log.MaxTotalMB != 0 {
		t.Fatalf("web log flags: %+v %v", web.Log, err)
	}
	if _, err = LoadWeb([]string{"--log-file=maybe"}, func(string) string { return "" }); err == nil {
		t.Fatal("accepted invalid --log-file")
	}
}
