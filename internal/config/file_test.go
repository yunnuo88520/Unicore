// Author: yunnuo <ymz@ebox.vip>
// Description: Startup files round-trip, reject typos and never overwrite existing configuration.
package config

import (
	"errors"
	"flag"
	"os"
	"path/filepath"
	"testing"
)

func TestStartupFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "unicore.json")
	if err := Generate(path); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(path)
	if err := Generate(path); err == nil {
		t.Fatal("overwrote existing configuration")
	}
	after, _ := os.ReadFile(path)
	if string(before) != string(after) {
		t.Fatal("existing configuration changed")
	}
	options, err := LoadWeb([]string{"--config", path}, func(string) string { return "" })
	if err != nil || options.Deployment != "tar" || options.DataDir != "data" {
		t.Fatal(options, err)
	}
	if err = os.WriteFile(path, []byte(`{"listen":"127.0.0.1:9001","log_level":"warn"}`), 0600); err != nil {
		t.Fatal(err)
	}
	env := map[string]string{"APP_CONFIG": path, "APP_LISTEN": "127.0.0.1:9002"}
	options, err = LoadWeb([]string{"--listen", "127.0.0.1:9003"}, func(key string) string { return env[key] })
	if err != nil || options.Listen != "127.0.0.1:9003" || options.Log.Level != "warn" {
		t.Fatal(options, err)
	}
	options, err = LoadWeb(nil, func(key string) string { return env[key] })
	if err != nil || options.Listen != "127.0.0.1:9002" {
		t.Fatal(options, err)
	}
	for _, data := range []string{`null`, `[]`, `{"listen":null}`, `{"api_docs":null}`, `{"data_dir":""}`, `{"listen":""}`, `{"lissten":"127.0.0.1:8000"}`, `{"listen":42}`, `{"api_docs":"yes"}`, `{} {}`, `{"profile":"desktop"}`, `{"monitor_listen":"0.0.0.0:9090"}`} {
		if err = os.WriteFile(path, []byte(data), 0600); err != nil {
			t.Fatal(err)
		}
		if _, err = LoadWeb([]string{"--config=" + path}, func(string) string { return "" }); err == nil {
			t.Errorf("accepted %s", data)
		}
	}
	for _, args := range [][]string{{"--config"}, {"--config="}, {"--config", path + "missing"}} {
		if _, err = LoadWeb(args, func(string) string { return "" }); err == nil {
			t.Fatal("invalid file path accepted", args)
		}
	}
}

func TestStartupFlagsUseStandardParsing(t *testing.T) {
	empty := func(string) string { return "" }
	for _, path := range []string{"--config", "--config=literal-directory"} {
		options, err := LoadWeb([]string{"--data-dir", path}, empty)
		if err != nil || options.DataDir != path {
			t.Fatal("flag value was treated as a config option", options, err)
		}
	}
	if _, err := LoadWeb([]string{"--config", "missing.json", "--help"}, empty); !errors.Is(err, flag.ErrHelp) {
		t.Fatal("help attempted to read configuration", err)
	}
	if _, err := LoadWeb([]string{"--", "--config", "missing.json"}, empty); err == nil {
		t.Fatal("accepted positional config option")
	}
	path := filepath.Join(t.TempDir(), "selected.json")
	if err := Generate(path); err != nil {
		t.Fatal(err)
	}
	env := func(key string) string {
		if key == "APP_CONFIG" {
			return "missing-environment.json"
		}
		return ""
	}
	if _, err := LoadWeb([]string{"-config", path}, env); err != nil {
		t.Fatal("explicit config did not override environment", err)
	}
}
