// Author: yunnuo <ymz@ebox.vip>
// Description: Explicit JSON startup configuration; environment and flags remain higher priority.
package config

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
)

// File contains startup options only. Installation records and secrets stay in the data directory.
type File struct {
	Listen           string `json:"listen"`
	Profile          string `json:"profile"`
	DataDir          string `json:"data_dir"`
	Deployment       string `json:"deployment"`
	LogLevel         string `json:"log_level"`
	LogFormat        string `json:"log_format"`
	MonitorListen    string `json:"monitor_listen"`
	ShutdownTimeout  string `json:"shutdown_timeout"`
	ReadinessTimeout string `json:"readiness_timeout"`
	APIDocs          bool   `json:"api_docs"`
}

func webFileLookup(path string, lookup Lookup) (Lookup, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read startup configuration: %w", err)
	}
	var file File
	if trimmed := bytes.TrimSpace(data); len(trimmed) == 0 || trimmed[0] != '{' {
		return nil, errors.New("startup configuration must be a JSON object")
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(&file); err != nil {
		return nil, errors.New("invalid startup configuration JSON")
	}
	if err = decoder.Decode(new(any)); err != io.EOF {
		return nil, errors.New("unexpected data after startup configuration")
	}
	// Reject null and explicit empty required fields rather than silently using defaults.
	var fields map[string]json.RawMessage
	if err = json.Unmarshal(data, &fields); err != nil {
		return nil, errors.New("invalid startup configuration JSON")
	}
	for field, raw := range fields {
		if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
			return nil, errors.New("startup configuration fields cannot be null")
		}
		if field != "profile" && field != "monitor_listen" && bytes.Equal(bytes.TrimSpace(raw), []byte(`""`)) {
			return nil, errors.New("required startup configuration fields cannot be empty")
		}
	}
	values := map[string]string{
		"APP_LISTEN": file.Listen, "APP_PROFILE": file.Profile, "APP_DATA_DIR": file.DataDir,
		"APP_DEPLOYMENT_KIND": file.Deployment, "APP_LOG_LEVEL": file.LogLevel, "APP_LOG_FORMAT": file.LogFormat,
		"APP_MONITOR_LISTEN": file.MonitorListen, "APP_SHUTDOWN_TIMEOUT": file.ShutdownTimeout,
		"APP_READINESS_TIMEOUT": file.ReadinessTimeout, "APP_API_DOCS": fmt.Sprint(file.APIDocs),
	}
	return func(key string) string {
		if value := lookup(key); value != "" {
			return value
		}
		return values[key]
	}, nil
}

// Generate writes a new private startup file and refuses replacement, including symlinks.
func Generate(path string) error {
	defaults, err := LoadWeb(nil, func(string) string { return "" })
	if err != nil {
		return err
	}
	file := File{Listen: defaults.Listen, Profile: defaults.Profile, DataDir: defaults.DataDir, Deployment: "tar", LogLevel: defaults.Log.Level, LogFormat: defaults.Log.Format, MonitorListen: defaults.MonitorListen, ShutdownTimeout: defaults.ShutdownTimeout.String(), ReadinessTimeout: defaults.ReadinessTimeout.String(), APIDocs: defaults.APIDocs}
	data, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	out, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return fmt.Errorf("create configuration (existing files are never overwritten): %w", err)
	}
	_, err = out.Write(append(data, '\n'))
	return errors.Join(err, out.Close())
}
