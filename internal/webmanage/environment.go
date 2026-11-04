// Author: yunnuo <ymz@ebox.vip>
// Description: Read a restricted systemd environment file literally; never source shell code or expose values.
package webmanage

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var environmentKey = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

func boundEnvironment(o options, c Console) (Console, error) {
	record, e := readService(o, c)
	if errors.Is(e, os.ErrNotExist) {
		return c, nil
	}
	if e != nil {
		return c, e
	}
	values := map[string]string{"APP_CONFIG": record.Config}
	if record.EnvironmentFile != "" {
		file, e := os.Open(record.EnvironmentFile)
		if e != nil {
			return c, errors.New("cannot read service EnvironmentFile; run as its owner or explicitly supply configuration and APP_SECRET_KEY")
		}
		defer file.Close()
		raw, e := io.ReadAll(io.LimitReader(file, 65537))
		if e != nil || len(raw) > 65536 {
			return c, errors.New("invalid service environment file")
		}
		parsed, e := parseEnvironment(string(raw))
		if e != nil {
			return c, e
		}
		for key, value := range parsed {
			values[key] = value
		}
	}
	if path := values["APP_CONFIG"]; path != "" && !filepath.IsAbs(path) {
		values["APP_CONFIG"] = filepath.Join(record.Directory, path)
	}
	c.directory = record.Directory
	original := c.Getenv
	c.Getenv = func(key string) string {
		if value := original(key); value != "" {
			return value
		}
		return values[key]
	}
	return c, nil
}
func parseEnvironment(raw string) (map[string]string, error) {
	values := map[string]string{}
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, ";") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if !ok || !environmentKey.MatchString(key) || strings.ContainsAny(value, "\\\x00") {
			return nil, errors.New("EnvironmentFile must use one literal KEY=value per line; shell commands and continuations are unsupported")
		}
		if len(value) >= 2 && ((value[0] == '"' && value[len(value)-1] == '"') || (value[0] == '\'' && value[len(value)-1] == '\'')) {
			value = value[1 : len(value)-1]
		} else if strings.ContainsAny(value, "\"'") {
			return nil, errors.New("unsupported EnvironmentFile quoting")
		}
		values[key] = value
	}
	return values, nil
}
