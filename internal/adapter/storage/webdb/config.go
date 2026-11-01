// Author: yunnuo <ymz@ebox.vip>
// Description: Build driver-safe connection strings from installer fields; preserve legacy DSN callers.
package webdb

import (
	"errors"
	"net"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"github.com/go-sql-driver/mysql"
	"github.com/jackc/pgx/v5"
	"github.com/yunnuo/unicore/internal/contracts"
)

func field(value *string, fallback string) string {
	if value == nil {
		return fallback
	}
	return *value
}

// DatabaseName excludes maintenance/system databases from installer initialization.
func DatabaseName(name string) bool {
	if !regexp.MustCompile(`^[A-Za-z0-9_][A-Za-z0-9_.-]{0,62}$`).MatchString(name) {
		return false
	}
	switch strings.ToLower(name) {
	case "mysql", "sys", "information_schema", "performance_schema", "postgres", "template0", "template1":
		return false
	}
	return true
}

func Resolve(input contracts.DatabaseInput) (dsn, name string, err error) {
	invalid := errors.New("invalid database fields")
	structured := input.Host != nil || input.Port != nil || input.Name != nil || input.Username != nil || input.Password != nil || input.Tls != nil
	if input.Driver == "sqlite" {
		if structured || input.Dsn != "" {
			return "", "", invalid
		}
		return "", "unicore.db", nil
	}
	if input.Driver != "mysql" && input.Driver != "postgres" {
		return "", "", invalid
	}
	if input.Dsn != "" {
		if structured || len(input.Dsn) > 4096 {
			return "", "", invalid
		}
		if input.Driver == "mysql" {
			config, e := mysql.ParseDSN(input.Dsn)
			if e != nil {
				return "", "", invalid
			}
			name = config.DBName
		} else {
			config, e := pgx.ParseConfig(input.Dsn)
			if e != nil {
				return "", "", invalid
			}
			name = config.Database
			if schema := config.RuntimeParams["search_path"]; schema != "" && schema != "public" {
				return "", "", invalid
			}
		}
		if !DatabaseName(name) {
			return "", "", invalid
		}
		return input.Dsn, name, nil
	}
	host := strings.TrimSpace(field(input.Host, "127.0.0.1"))
	name = strings.TrimSpace(field(input.Name, "unicore"))
	username := field(input.Username, map[string]string{"mysql": "root", "postgres": "postgres"}[input.Driver])
	password := field(input.Password, "")
	port := map[string]int{"mysql": 3306, "postgres": 5432}[input.Driver]
	if input.Port != nil {
		port = *input.Port
	}
	if !DatabaseName(name) || port < 1 || port > 65535 || username == "" || len(username) > 128 || strings.ContainsAny(username, "\x00\r\n") || len(password) > 1024 {
		return "", "", invalid
	}
	if net.ParseIP(host) == nil && !regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$`).MatchString(host) {
		return "", "", invalid
	}
	// TLS is a plain switch; off keeps local and intranet databases reachable by default.
	encrypted := input.Tls != nil && *input.Tls
	address := net.JoinHostPort(host, strconv.Itoa(port))
	if input.Driver == "mysql" {
		config := mysql.NewConfig()
		config.User, config.Passwd, config.Net, config.Addr, config.DBName = username, password, "tcp", address, name
		config.ParseTime = true
		config.Params = map[string]string{"charset": "utf8mb4"}
		if encrypted {
			config.TLSConfig = "skip-verify"
		} else {
			config.TLSConfig = "false"
		}
		return config.FormatDSN(), name, nil
	}
	connection := url.URL{Scheme: "postgres", Host: address, Path: "/" + name, User: url.UserPassword(username, password)}
	query := url.Values{"connect_timeout": {"5"}, "search_path": {"public"}, "sslmode": {"disable"}}
	if encrypted {
		// "require" encrypts traffic without certificate checks so self-signed intranet certificates stay usable.
		query.Set("sslmode", "require")
	}
	connection.RawQuery = query.Encode()
	return connection.String(), name, nil
}
