// Author: yunnuo <ymz@ebox.vip>
// Description: Explicit YAML/JSON startup configuration; environment and flags remain higher priority.
package config

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"go.yaml.in/yaml/v3"
)

const DefaultFileName = "config.yaml"

// File contains startup options only. Installation records and secrets stay in the data directory.
type File struct {
	Listen           string `json:"listen" yaml:"listen"`
	Profile          string `json:"profile" yaml:"profile"`
	DataDir          string `json:"data_dir" yaml:"data_dir"`
	Deployment       string `json:"deployment" yaml:"deployment"`
	LogLevel         string `json:"log_level" yaml:"log_level"`
	LogFormat        string `json:"log_format" yaml:"log_format"`
	MonitorListen    string `json:"monitor_listen" yaml:"monitor_listen"`
	ShutdownTimeout  string `json:"shutdown_timeout" yaml:"shutdown_timeout"`
	ReadinessTimeout string `json:"readiness_timeout" yaml:"readiness_timeout"`
	APIDocs          bool   `json:"api_docs" yaml:"api_docs"`
}

func webFileLookup(path string, lookup Lookup) (Lookup, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read startup configuration: %w", err)
	}
	var file File
	if strings.EqualFold(filepath.Ext(path), ".json") {
		file, err = decodeJSON(data)
	} else {
		file, err = decodeYAML(data)
	}
	if err != nil {
		return nil, err
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
	var data []byte
	if strings.EqualFold(filepath.Ext(path), ".json") {
		data, err = json.MarshalIndent(file, "", "  ")
	} else {
		data, err = yaml.Marshal(file)
	}
	if err != nil {
		return err
	}
	out, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return fmt.Errorf("create configuration (existing files are never overwritten): %w", err)
	}
	_, err = out.Write(append(bytes.TrimRight(data, "\n"), '\n'))
	return errors.Join(err, out.Close())
}

func decodeJSON(data []byte) (File, error) {
	var err error
	var file File
	if trimmed := bytes.TrimSpace(data); len(trimmed) == 0 || trimmed[0] != '{' {
		return File{}, errors.New("startup configuration must be a JSON object")
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(&file); err != nil {
		return File{}, errors.New("invalid startup configuration JSON")
	}
	if err = decoder.Decode(new(any)); err != io.EOF {
		return File{}, errors.New("unexpected data after startup configuration")
	}
	// Reject null and explicit empty required fields rather than silently using defaults.
	var fields map[string]json.RawMessage
	if err = json.Unmarshal(data, &fields); err != nil {
		return File{}, errors.New("invalid startup configuration JSON")
	}
	for field, raw := range fields {
		if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
			return File{}, errors.New("startup configuration fields cannot be null")
		}
		if field != "profile" && field != "monitor_listen" && bytes.Equal(bytes.TrimSpace(raw), []byte(`""`)) {
			return File{}, errors.New("required startup configuration fields cannot be empty")
		}
	}
	if _, err := decodeYAML(data); err != nil {
		return File{}, err
	}
	return file, nil
}

func decodeYAML(data []byte) (File, error) {
	var file File
	decoder := yaml.NewDecoder(bytes.NewReader(data))
	var document yaml.Node
	if err := decoder.Decode(&document); err != nil || len(document.Content) != 1 || document.Content[0].Kind != yaml.MappingNode {
		return file, errors.New("startup configuration must be a YAML mapping")
	}
	root := document.Content[0]
	allowed := map[string]bool{"listen": true, "profile": true, "data_dir": true, "deployment": true, "log_level": true, "log_format": true, "monitor_listen": true, "shutdown_timeout": true, "readiness_timeout": true, "api_docs": true}
	seen := map[string]bool{}
	for index := 0; index < len(root.Content); index += 2 {
		key, value := root.Content[index], root.Content[index+1]
		if key.Kind != yaml.ScalarNode || key.Tag != "!!str" || !allowed[key.Value] || seen[key.Value] {
			return file, errors.New("unknown or duplicate startup configuration field")
		}
		seen[key.Value] = true
		tag := "!!str"
		if key.Value == "api_docs" {
			tag = "!!bool"
		}
		if value.Kind != yaml.ScalarNode || value.Tag != tag {
			return file, errors.New("invalid startup configuration field type")
		}
		if key.Value != "profile" && key.Value != "monitor_listen" && value.Value == "" {
			return file, errors.New("required startup configuration fields cannot be empty")
		}
	}
	if err := root.Decode(&file); err != nil {
		return file, errors.New("invalid startup configuration YAML")
	}
	if err := decoder.Decode(new(yaml.Node)); err != io.EOF {
		return file, errors.New("unexpected data after startup configuration")
	}
	return file, nil
}
